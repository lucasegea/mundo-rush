// open-world-3d T2(d) (AC72, D-830): tooling/vendor/** is third-party code, outside lint and outside the workspaces;
// the rest of tooling is still linted (--stdin probe with a known error, FD0 lesson: the target folder exists).
// The git attributes leave vendored code and decoders byte for byte, and mark .ktx2/.wasm/.bin as binaries.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, test } from "vitest";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const ESLINT_BIN = join(ROOT, "node_modules/eslint/bin/eslint.js");

const attr = (name: string, path: string): string => {
  const r = spawnSync("git", ["check-attr", name, "--", path], { cwd: ROOT, encoding: "utf8" });
  return r.stdout.trim().split(": ").at(-1) ?? "";
};

describe("AC72: higiene del código vendorizado", () => {
  test("eslint ignora tooling/vendor/** y sigue mirando el resto de tooling", async () => {
    const eslint = new ESLint({ cwd: ROOT });
    expect(await eslint.isPathIgnored(join(ROOT, "tooling/vendor/ez-tree/src/tree.js"))).toBe(true);
    expect(await eslint.isPathIgnored(join(ROOT, "tooling/assets-probe.ts"))).toBe(false);
  });

  test("sonda --stdin: un error conocido en tooling/assets-probe.ts sale con 1 (la carpeta existe)", () => {
    expect(statSync(join(ROOT, "tooling")).isDirectory()).toBe(true);
    const r = spawnSync(process.execPath, [ESLINT_BIN, "--max-warnings", "0", "--stdin", "--stdin-filename", "tooling/assets-probe.ts"], {
      cwd: ROOT, input: "export const x: any = 1;\n", encoding: "utf8",
    });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("@typescript-eslint/no-explicit-any");
  });

  test("git deja tooling/vendor/ y public/decoders/ sin normalizar, y .ktx2/.wasm/.bin son binarios", () => {
    expect(attr("text", "tooling/vendor/ez-tree/src/tree.js")).toBe("unset");
    expect(attr("text", "apps/web/public/decoders/meshopt_decoder.module.js")).toBe("unset");
    for (const ext of ["ktx2", "wasm", "bin"]) expect(attr("binary", `apps/web/public/textures/x.${ext}`), ext).toBe("set");
  });

  test("ningún package.json bajo tooling/vendor/ y los workspaces son los mismos", () => {
    const vendor = join(ROOT, "tooling/vendor");
    const conPkg = (dir: string): string[] => !existsSync(dir) ? [] : readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? conPkg(join(dir, e.name)) : e.name === "package.json" ? [join(dir, e.name)] : []);
    expect(conPkg(vendor)).toEqual([]);
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { workspaces: string[] };
    expect(pkg.workspaces).toEqual(["apps/*", "packages/*", "tooling/*"]);
    const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8")) as { packages: Record<string, unknown> };
    const ws = Object.keys(lock.packages).filter((k) => k !== "" && !k.includes("node_modules/"));
    expect(ws).toEqual(["apps/server", "apps/web", "packages/art", "packages/content-schema", "packages/core", "packages/protocol", "tooling/book-analyzer", "tooling/director"]);
  });
});
