// FD0 A2: el plugin está SOLO en la config fusionada del director; la de apps/web no lo tiene (sin levantar servidor).
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { loadConfigFromFile, type PluginOption, type UserConfig } from "vite";

const ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const env = { command: "serve" as const, mode: "development" };
const before = process.env["VITE_LG_DIRECTOR"];
afterAll(() => {
  if (before === undefined) delete process.env["VITE_LG_DIRECTOR"];
  else process.env["VITE_LG_DIRECTOR"] = before;
});

const pluginNames = (plugins: PluginOption[] | undefined): string[] =>
  (plugins ?? []).flat(Infinity as 10).flatMap((p) => (p && typeof p === "object" && "name" in p ? [p.name] : []));

const load = async (file: string): Promise<UserConfig> => {
  const r = await loadConfigFromFile(env, join(ROOT, file), ROOT, "silent");
  if (!r) throw new Error(`no cargó ${file}`);
  return r.config;
};

describe("cableado del plugin (03 §6.5.1 punto 2)", () => {
  test("la config fusionada tiene el plugin; la de apps/web no", async () => {
    delete process.env["VITE_LG_DIRECTOR"];
    const web = await load("apps/web/vite.config.ts");
    expect(process.env["VITE_LG_DIRECTOR"]).toBeUndefined();
    const director = await load("tooling/director/vite.config.ts");
    expect(pluginNames(web.plugins)).not.toContain("lg-director");
    expect(pluginNames(director.plugins)).toContain("lg-director");
    // La fusión conserva todo lo de apps/web (mismos plugins y alias) y le suma solo el del director.
    expect(pluginNames(director.plugins).filter((n) => n !== "lg-director")).toEqual(pluginNames(web.plugins));
    expect(director.resolve?.alias).toEqual(web.resolve?.alias);
  });

  test("la config del director sirve apps/web en 127.0.0.1 y prende la segunda llave", async () => {
    const director = await load("tooling/director/vite.config.ts");
    expect(director.root?.replace(/\\/g, "/").replace(/\/$/, "")).toBe(join(ROOT, "apps/web").replace(/\\/g, "/"));
    expect(director.server?.host).toBe("127.0.0.1");
    expect(process.env["VITE_LG_DIRECTOR"]).toBe("1");
  });

  test("el plugin solo aplica en serve (nunca en build)", async () => {
    const director = await load("tooling/director/vite.config.ts");
    const plugin = (director.plugins ?? []).flat(Infinity as 10).find((p) => p && typeof p === "object" && "name" in p && p.name === "lg-director");
    expect(plugin && typeof plugin === "object" && "apply" in plugin ? plugin.apply : null).toBe("serve");
  });

  test("dev:director resuelve a vite --config tooling/director/vite.config.ts; dev y build siguen sin el director", () => {
    const root = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string>; workspaces: string[] };
    expect(root.scripts["dev:director"]).toBe("vite --config tooling/director/vite.config.ts");
    expect(root.workspaces).toContain("tooling/*");
    const web = JSON.parse(readFileSync(join(ROOT, "apps/web/package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(web.scripts["dev"]).toBe("vite");
    expect(web.scripts["build"]).toBe("vite build");
  });

  test("el SDK de MCP es devDependency de tooling/director y de nadie más; no hay SDK de Anthropic", () => {
    const pkg = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8")) as Record<string, Record<string, string> | undefined>;
    const director = pkg("tooling/director/package.json");
    expect(director["devDependencies"]?.["@modelcontextprotocol/sdk"]).toBeDefined();
    expect(director["private"]).toBe(true);
    for (const p of ["package.json", "apps/web/package.json", "apps/server/package.json", "packages/core/package.json", "packages/protocol/package.json", "packages/content-schema/package.json", "tooling/director/package.json"]) {
      const all = { ...pkg(p)["dependencies"], ...pkg(p)["devDependencies"] };
      if (p !== "tooling/director/package.json") expect(Object.keys(all), p).not.toContain("@modelcontextprotocol/sdk");
      expect(Object.keys(all).filter((d) => d.startsWith("@anthropic-ai/")), p).toEqual([]);
    }
  });

  test(".director/ está en .gitignore y .mcp.json registra el servidor por stdio", () => {
    expect(readFileSync(join(ROOT, ".gitignore"), "utf8").split(/\r?\n/)).toContain(".director/");
    const mcp = JSON.parse(readFileSync(join(ROOT, ".mcp.json"), "utf8")) as { mcpServers: Record<string, { type: string; command: string; args: string[] }> };
    expect(mcp.mcpServers["lg-director"]).toEqual({ type: "stdio", command: "node", args: ["tooling/director/src/mcp.ts"] });
  });
});
