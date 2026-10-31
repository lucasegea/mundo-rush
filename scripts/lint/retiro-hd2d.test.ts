// Plan estetica-c M7 (D-207): tree test for the HD-2D retirement. Walks the real code of apps/ and packages/ (sources and
// tests, without node_modules, dist or public) and requires:
// - that the deleted modules (per-chunk tiles, pixel art, sprite sheets and billboards, F2 boxes) do not exist nor does
//   anyone import them, and that the retired names (integer pixel scale, snap, orthographic frustum, topdown and
//   iso pitch, tile layers) do not appear;
// - that there is no `NearestFilter` in product code except in the toon ramp (world/materials/toon.ts);
// - that there is no `OrthographicCamera` (nor the `orthographic` prop of <Canvas>) in any file of apps/ or packages/,
//   portraits and director mode included.
// Each rule has teeth on synthetic text, and the walk proves it measured something (F1.1b lesson: 0 of 0 is not green).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCANNED_ROOTS = ["apps", "packages"];
const SKIP_DIRS = new Set(["node_modules", "dist", "public", "coverage", ".vitest", "generated"]);
const SOURCE_EXT = /\.(ts|tsx|js|mjs|cjs)$/;

/** The only product file that may use NearestFilter: the toon 4-band ramp (plan estetica-c M1 item 6). */
export const NEAREST_ALLOWED = "apps/web/src/world/materials/toon.ts";

/** HD-2D modules deleted in M7: no import may point at them. */
export const RETIRED_MODULES = [
  "apps/web/src/world/tiles",
  "apps/web/src/world/art",
  "apps/web/src/world/sprites",
  "apps/web/src/world/props/Boxes.tsx",
] as const;

/** Import specifiers that point at a retired module (relative or by alias). */
const RETIRED_IMPORT = /from\s+["'](?:[^"']*\/)?(?:world\/tiles|tiles\/(?:atlas|buildTileChunk|TileLayers)|art\/(?:pixels|texture)|sprites\/(?:sheet|orientation|Billboard)|props\/Boxes)(?:\.tsx?)?["']/;

/** Retired names: if they appear, HD-2D code or a test was left behind. */
export const RETIRED_NAMES = [
  "zoomPixelScales", "zoomViewWidth", "snapToPixelGrid", "orthoFrustum", "TARGET_TILES_WIDE", "TILE_PX",
  "TOPDOWN_PITCH_DEG", "ISO_PITCH_DEG", "parseTileRows", "TileLayerData", "buildTileChunk", "TileLayers", "Billboard",
  "topdownOrtho", "isoOrtho",
] as const;
const retiredNameRe = new RegExp(`\\b(${RETIRED_NAMES.join("|")})\\b`, "g");

const ORTHO = /OrthographicCamera|\borthographic\b/;
// Recorded change (open-world-3d T7, AC44): the two orthographic cameras of the impostor bake (from the side and from
// above, to a texture, never to the screen) live in world/camera/bakeCamera.ts by R11. It is the only exception.
const ORTHO_ALLOWED = new Set(["apps/web/src/world/camera/bakeCamera.ts"]);
const NEAREST = /\bNearestFilter\b/;
/**
 * Tests that name the old presets on purpose: a saved setting with an orthographic preset falls back to the default (A11) and
 * R11's registry no longer has them (F2's A4, rewritten in M7). Only those two names, only in those tests.
 */
// Recorded change (open-world-3d T5, AC27): apps/web/test/third-person.test.tsx is added, which loads a saved setting
// `topdownOrtho` to prove it falls back to `thirdPerson` (PD-5). Before, it was only the two tests above.
const OLD_PRESET_ALLOWED = new Set(["packages/core/test/estetica-c.test.ts", "apps/web/test/world-pure.test.ts", "apps/web/test/third-person.test.tsx"]);
const OLD_PRESETS = new Set(["topdownOrtho", "isoOrtho"]);

export interface TreeFile {
  path: string;
  text: string;
}

export interface TreeViolation {
  path: string;
  rule: "import-retirado" | "nombre-retirado" | "nearest" | "ortografica";
  detail: string;
}

const isProductSource = (path: string): boolean => /^(apps\/[^/]+|packages\/[^/]+)\/src\//.test(path);

/** The violations of a set of files (pure: the teeth test it with synthetic text). */
export function scanTree(files: readonly TreeFile[]): TreeViolation[] {
  const out: TreeViolation[] = [];
  for (const { path, text } of files) {
    const imp = text.match(RETIRED_IMPORT);
    if (imp) out.push({ path, rule: "import-retirado", detail: imp[0] });
    const names = [...text.matchAll(retiredNameRe)].map((m) => m[1] ?? "").filter((n) => !(OLD_PRESET_ALLOWED.has(path) && OLD_PRESETS.has(n)));
    if (names.length > 0) out.push({ path, rule: "nombre-retirado", detail: [...new Set(names)].join(", ") });
    if (isProductSource(path) && path !== NEAREST_ALLOWED && NEAREST.test(text)) out.push({ path, rule: "nearest", detail: "NearestFilter" });
    const ortho = text.match(ORTHO);
    if (ortho && !ORTHO_ALLOWED.has(path)) out.push({ path, rule: "ortografica", detail: ortho[0] });
  }
  return out;
}

function walk(dir: string, acc: TreeFile[]): void {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (SOURCE_EXT.test(entry) && !entry.endsWith(".d.ts")) acc.push({ path: relative(ROOT, full).replace(/\\/g, "/"), text: readFileSync(full, "utf8") });
  }
}

const realTree = (): TreeFile[] => {
  const acc: TreeFile[] = [];
  for (const r of SCANNED_ROOTS) walk(join(ROOT, r), acc);
  return acc;
};

describe("plan estetica-c M7: el árbol no tiene código de HD-2D", () => {
  const files = realTree();

  test("el recorrido mide algo: fuentes y tests de apps/ y packages/, incluidos world/, portraits/ y dev/director/", () => {
    expect(files.length).toBeGreaterThan(200);
    for (const marker of [
      NEAREST_ALLOWED, "apps/web/src/world/GameCanvas.tsx", "apps/web/src/world/camera/CameraRig.tsx",
      "apps/web/src/world/portraits/studio.ts", "apps/web/src/dev/director/snapshot.ts", "packages/core/src/camera/camera.ts",
      "packages/content-schema/src/schemas/mundo.ts", "apps/web/test/world-pure.test.ts",
    ]) {
      expect(files.some((f) => f.path === marker), marker).toBe(true);
    }
    // The exception really exists: the toon ramp uses NearestFilter (otherwise the rule could pass for the wrong reason).
    expect(NEAREST.test(files.find((f) => f.path === NEAREST_ALLOWED)?.text ?? "")).toBe(true);
  });

  test("los módulos retirados no existen", () => {
    for (const m of RETIRED_MODULES) expect(existsSync(join(ROOT, m)), m).toBe(false);
  });

  test("ningún archivo importa un módulo retirado ni usa un nombre retirado; NearestFilter solo en la rampa toon; ninguna cámara ortográfica", () => {
    expect(scanTree(files)).toEqual([]);
  });
});

describe("dientes del test de árbol (texto sintético)", () => {
  const one = (path: string, text: string): TreeViolation["rule"][] => scanTree([{ path, text }]).map((v) => v.rule);

  test("un import de un módulo retirado falla (relativo, por alias y con extensión)", () => {
    expect(one("apps/web/src/world/dioramas/x.ts", 'import { TEST_ATLAS } from "../tiles/atlas";')).toContain("import-retirado");
    expect(one("apps/web/src/world/x.tsx", 'import { TileLayers } from "./tiles/TileLayers";')).toContain("import-retirado");
    expect(one("apps/web/test/x.test.ts", 'import { getPixel } from "../src/world/art/pixels";')).toContain("import-retirado");
    expect(one("apps/web/src/world/x.tsx", 'import { Billboard } from "@world/sprites/Billboard.tsx";')).toContain("import-retirado");
    expect(one("apps/web/src/world/x.tsx", 'import { Boxes } from "./props/Boxes";')).toContain("import-retirado");
    expect(one("apps/web/src/world/x.tsx", 'import { buildProp } from "./props/builders";')).toEqual([]);
  });

  test("un nombre retirado falla; uno parecido no", () => {
    expect(one("apps/web/src/world/camera/rig.ts", "export function snapToPixelGrid() {}")).toContain("nombre-retirado");
    expect(one("packages/core/src/camera/camera.ts", 'export const CAMERA_PRESET_IDS = ["topdownOrtho"] as const;')).toContain("nombre-retirado");
    expect(one("packages/core/test/estetica-c.test.ts", 'test.each(["topdownOrtho", "isoOrtho"])')).toEqual([]);
    // the exception is only for the two presets: another retired name in the same test fails all the same.
    expect(one("packages/core/test/estetica-c.test.ts", 'test.each(["topdownOrtho"]); orthoFrustum(1, 1);')).toEqual(["nombre-retirado"]);
    expect(one("apps/web/src/world/x.ts", "const myTILE_PXs = 1;")).toEqual([]);
  });

  test("NearestFilter fuera de la rampa toon falla; en toon.ts y en un test pasa", () => {
    expect(one("apps/web/src/world/terrain/x.ts", 'import { NearestFilter } from "three";')).toEqual(["nearest"]);
    expect(one("apps/web/src/world/labels/labelSprite.ts", "tex.magFilter = NearestFilter;")).toEqual(["nearest"]);
    expect(one(NEAREST_ALLOWED, "ramp.magFilter = NearestFilter;")).toEqual([]);
    expect(one("apps/web/test/estetica-c.test.ts", "expect(r.magFilter).toBe(NearestFilter);")).toEqual([]);
  });

  test("una cámara ortográfica falla en cualquier lado, también en world/camera/, los retratos y los tests", () => {
    for (const path of ["apps/web/src/world/camera/CameraRig.tsx", "apps/web/src/world/camera/portrait.ts", "apps/web/src/dev/director/x.ts", "apps/web/test/x.test.ts"]) {
      expect(one(path, 'import { OrthographicCamera } from "three";'), path).toEqual(["ortografica"]);
    }
    expect(one("apps/web/src/world/GameCanvas.tsx", "<Canvas orthographic frameloop=\"always\" />")).toEqual(["ortografica"]);
    expect(one("apps/web/src/world/camera/CameraRig.tsx", "<PerspectiveCamera makeDefault />")).toEqual([]);
    // T7: only the impostor bake, only in its file.
    expect(one("apps/web/src/world/camera/bakeCamera.ts", 'import { OrthographicCamera } from "three";')).toEqual([]);
    expect(one("apps/web/src/world/nature/impostor.ts", 'import { OrthographicCamera } from "three";')).toEqual(["ortografica"]);
  });
});
