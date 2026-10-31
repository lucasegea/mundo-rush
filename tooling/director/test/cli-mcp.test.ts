// FD0 A8 and A9: the CLI over a fixture .director/ and the MCP server (four tools, each returns the
// same as read.ts). The MCP is tested in-process with the SDK's in-memory transport: no network or stdio.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runCli } from "../src/cli.ts";
import { createDirectorMcpServer, directorTools, TOOL_NAMES } from "../src/mcp.ts";
import { formatWhere, listSessions, lookupContent, readJournal, readState } from "../src/read.ts";
import { AT, ROOT, removeRoot, sampleEvents, snapshot, tempRoot, writeSession, writeState } from "./helpers.ts";

let root: string;
const NOW = Date.parse(AT) + 3000;

const cli = (...argv: string[]) => {
  const out: string[] = [];
  const err: string[] = [];
  const code = runCli(argv, { root, out: (l) => out.push(l), err: (l) => err.push(l), now: () => NOW });
  return { code, out, err };
};

beforeEach(() => {
  root = tempRoot();
  writeState(root, snapshot({
    nearby: ["OBJ-CARTEL", "NPC-NELL"],
    scene: { missionId: "M1.1", sceneId: "M1.1-E1", step: "turnoJugador", turnIndex: 2 },
  }));
  writeSession(root, "20261007-110000-aaaa", sampleEvents(), 1_700_000_000);
  writeSession(root, "20261007-120000-abcd", [...sampleEvents(), { seq: 5, at: AT, type: "session.end" }], 1_700_000_100);
});
afterEach(() => removeRoot(root));

describe("A8: CLI sobre un .director/ de fixture", () => {
  test("where imprime UNA línea con diorama, tile, NPC cercano, misión y paso", () => {
    const r = cli("where");
    expect(r.code).toBe(0);
    expect(r.out).toHaveLength(1);
    expect(r.out[0]).toBe("test · tile (12,8) · NPC cerca: NPC-NELL · misión M1.1 · escena M1.1-E1 · paso turnoJugador · hace 3 s");
    expect(r.out[0]).not.toContain("\n");
  });

  test("where sin escena y sin estado", () => {
    writeState(root, snapshot());
    expect(cli("where").out[0]).toBe("test · tile (12,8) · NPC cerca: NPC-NELL · misión — · sin escena · hace 3 s");
    removeRoot(root);
    root = tempRoot();
    const r = cli("where");
    expect(r.code).toBe(1);
    expect(r.out[0]).toMatch(/^sin estado/);
  });

  test("state imprime el snapshot validado", () => {
    const r = cli("state");
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out.join("\n"))).toEqual(readState(root));
  });

  test("journal: la sesión más reciente, --tail y --session", () => {
    expect(cli("journal").out).toHaveLength(6);
    expect(cli("journal", "--tail", "5").out.map((l) => (JSON.parse(l) as { seq: number }).seq)).toEqual([1, 2, 3, 4, 5]);
    const tail = cli("journal", "--tail", "2");
    expect(tail.out.map((l) => (JSON.parse(l) as { type: string }).type)).toEqual(["scene.end", "session.end"]);
    const other = cli("journal", "--session", "20261007-110000-aaaa", "--tail", "1");
    expect(other.out.map((l) => (JSON.parse(l) as { seq: number }).seq)).toEqual([4]);
    expect(cli("journal", "--tail", "dos").code).toBe(2);
    expect(cli("journal", "--session", "../x").code).toBe(1);
  });

  test("sessions lista de la más nueva a la más vieja, con NPCs y si quedó abierta", () => {
    const r = cli("sessions");
    expect(r.out).toEqual([
      `20261007-120000-abcd  6 eventos  ${AT} → ${AT}  NPCs: NPC-NELL`,
      `20261007-110000-aaaa  5 eventos  ${AT} → ${AT} (abierta)  NPCs: NPC-NELL`,
    ]);
  });

  test("content <id> encuentra el archivo y su YAML (contenido real)", () => {
    const real = (...argv: string[]) => {
      const out: string[] = [];
      const code = runCli(argv, { root: ROOT, out: (l) => out.push(l), err: () => undefined });
      return { code, out: out.join("\n") };
    };
    const npc = real("content", "NPC-NELL");
    expect(npc.code).toBe(0);
    expect(npc.out.split("\n")[0]).toBe("content/npcs/NPC-NELL.yaml");
    expect(npc.out).toContain("NPC-NELL");
    expect(real("content", "M1.1-E1").out.split("\n")[0]).toBe("content/missions/M1.1.yaml");
    expect(real("content", "NPC-INES").out.split("\n")[0]).toBe("content/npcs/NPC-INES.yaml");
    expect(real("content", "NO-EXISTE").code).toBe(1);
    expect(cli("content").code).toBe(2);
  });

  test("prune deja 30 sesiones", () => {
    for (let i = 0; i < 31; i++) writeSession(root, `x${String(i).padStart(2, "0")}`, sampleEvents(), 1_600_000_000 + i);
    const r = cli("prune");
    expect(r.out[0]).toBe("diario: 3 sesión(es) borrada(s)");
    expect(listSessions(root)).toHaveLength(30);
  });

  test("un comando desconocido muestra el uso y sale con 2", () => {
    const r = cli("nada");
    expect(r.code).toBe(2);
    expect(r.err[0]).toMatch(/^uso: npm run director -- state \| where/);
  });

  test("formatWhere dice cuántos errores de contenido hay", () => {
    expect(formatWhere(snapshot({ contentErrors: [{ file: "content/x.yaml", key: "a", message: "m" }] }), NOW)).toContain("1 error(es) de contenido");
  });
});

describe("A9: servidor MCP", () => {
  const connect = async (at: string = root) => {
    const server = createDirectorMcpServer(at);
    const client = new Client({ name: "test", version: "0.0.0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    return { client, close: async () => { await client.close(); await server.close(); } };
  };
  const call = async (client: Client, name: string, args: Record<string, unknown> = {}): Promise<unknown> => {
    const r = await client.callTool({ name, arguments: args });
    const content = r.content as { type: string; text: string }[];
    expect(content[0]?.type).toBe("text");
    return JSON.parse(content[0]?.text ?? "null") as unknown;
  };

  test("expone exactamente las 4 herramientas", async () => {
    const { client, close } = await connect();
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
      expect(Object.keys(directorTools(root)).sort()).toEqual([...TOOL_NAMES].sort());
    } finally {
      await close();
    }
  });

  test("cada herramienta devuelve lo que devuelve read.ts", async () => {
    const { client, close } = await connect();
    try {
      expect(await call(client, "director_state")).toEqual({ where: formatWhere(readState(root)), state: readState(root) });
      expect(await call(client, "director_journal", { tail: 2 })).toEqual(readJournal(root, { tail: 2 }));
      expect(await call(client, "director_journal", { session: "20261007-110000-aaaa" })).toEqual(readJournal(root, { session: "20261007-110000-aaaa" }));
      expect(await call(client, "director_sessions")).toEqual(listSessions(root));
    } finally {
      await close();
    }
  });

  test("director_content_lookup sobre el contenido real (solo lectura)", async () => {
    const { client, close } = await connect(ROOT);
    try {
      expect(await call(client, "director_content_lookup", { id: "SAB-MATE" })).toEqual(lookupContent(ROOT, "SAB-MATE"));
      expect(await call(client, "director_content_lookup", { id: "NO-EXISTE" })).toBeNull();
    } finally {
      await close();
    }
  });
});
