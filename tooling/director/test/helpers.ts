// Fixtures de los tests del modo director: un repo temporal con `.director/` y, si hace falta, una copia de content/.
import { cpSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DirectorSnapshot, JournalEvent } from "@lg/protocol/director";

export const ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
export const AT = "2026-10-07T12:00:00.000Z";

export const tempRoot = (withContent = false): string => {
  const dir = mkdtempSync(join(tmpdir(), "lg-director-"));
  if (withContent) cpSync(join(ROOT, "content"), join(dir, "content"), { recursive: true });
  return dir;
};

export const removeRoot = (dir: string | undefined): void => {
  if (dir) rmSync(dir, { recursive: true, force: true });
};

export const snapshot = (patch: Partial<DirectorSnapshot> = {}): DirectorSnapshot => ({
  v: 1, sessionId: "20261007-120000-abcd", at: AT, build: { contentHash: null, gitSha: null }, region: "Kestrel Valley",
  diorama: "test", player: { tile: { x: 12, y: 8 }, pos: { x: 12.4, z: 8.6 }, facing: "s" }, nearby: ["NPC-NELL"],
  scene: null, path: [{ tile: { x: 12, y: 8 }, at: AT }], npcsTalked: [], dialogue: [], worldFlags: {}, foundations: {},
  network: [], lastPick: null, contentErrors: [], ...patch,
});

export const writeState = (root: string, s: DirectorSnapshot): void => {
  mkdirSync(join(root, ".director"), { recursive: true });
  writeFileSync(join(root, ".director/state.json"), `${JSON.stringify(s)}\n`);
};

/** Escribe una sesión del diario con fecha de modificación `mtimeSec` (orden de las sesiones). */
export const writeSession = (root: string, id: string, events: JournalEvent[], mtimeSec = 1_700_000_000): void => {
  const dir = join(root, ".director/journal");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${id}.jsonl`);
  writeFileSync(path, events.map((e) => `${JSON.stringify(e)}\n`).join(""));
  utimesSync(path, mtimeSec, mtimeSec);
};

export const sampleEvents = (): JournalEvent[] => [
  { seq: 0, at: AT, type: "session.start", gitSha: "abc", contentHash: "def", tier: "low" },
  { seq: 1, at: AT, type: "move.cell", diorama: "test", tile: { x: 12, y: 8 } },
  { seq: 2, at: AT, type: "interact", targetId: "NPC-NELL" },
  { seq: 3, at: AT, type: "scene.start", missionId: null, sceneId: null, npcId: "NPC-NELL" },
  { seq: 4, at: AT, type: "scene.end", result: "cerrada", criteriaMet: [] },
];

/** req/res falsos para los manejadores de connect (sin red). */
export const fakeHttp = (url: string, method = "GET") => {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: "",
    setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; },
    end(b?: string) { this.body = b ?? ""; },
  };
  return { req: { url, method }, res };
};
