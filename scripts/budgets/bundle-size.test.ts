// Tests de check:budgets (F1.1b A1, A2) y del centinela check:dev-only.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import {
  BUDGET_KEYS,
  checkBundle,
  checkPostChunk,
  formatReport,
  loadBudgets,
  run,
  staticClosure,
  THREE_MODULE,
  POST_ENTRY,
  POST_MODULE,
  WORLD_CANVAS_ENTRY,
  type Budgets,
  type ChunkModules,
  type Manifest,
  type ManifestChunk,
} from "./bundle-size";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const KB = 1000; // como bundle-size.ts y los "kB" de vite build

// ---------- A1: budgets.json = 03 §2.7.3 ----------
describe("A1 budgets.json coincide con 03 §2.7.3", () => {
  const budgets = loadBudgets();

  test("valores exactos de la tabla (D-160: sin fila nueva de post)", () => {
    expect(budgets).toEqual({
      shell_js_css_gzip_kb: 300,
      chunk_3d_gzip_kb: 450,
      docente_gzip_kb: 250,
      assets_muelle_mb: 6,
      assets_muelle_plaza_mb: 15,
      audio_lineas_por_mision_mb: 1.5,
    });
    expect(Object.keys(budgets)).not.toContain("chunk_post_gzip_kb");
  });

  // Lee el documento: si alguien cambia la tabla y no el JSON (o al revés), esto falla.
  const doc = readFileSync(join(ROOT, "docs/03-architecture.md"), "utf8");
  const start = doc.indexOf("#### 2.7.3 Bundle and download");
  const section = doc.slice(start, doc.indexOf("#### 2.7.4", start));

  test("las claves y valores que lista el párrafo de §2.7.3 son los del JSON", () => {
    const pairs = [...section.matchAll(/`([a-z0-9_]+): ([\d.]+)`/g)].map((m) => [m[1], Number(m[2])]);
    expect(Object.fromEntries(pairs)).toEqual(budgets);
  });

  test("las filas de la tabla de §2.7.3 tienen los mismos topes", () => {
    const rows: Record<string, keyof Budgets> = {
      "Shell": "shell_js_css_gzip_kb",
      "3D chunk": "chunk_3d_gzip_kb",
      "Teacher panel": "docente_gzip_kb",
      "First diorama assets": "assets_muelle_mb",
      "Dock + Plaza": "assets_muelle_plaza_mb",
      "Cached audio": "audio_lineas_por_mision_mb",
    };
    for (const [label, key] of Object.entries(rows)) {
      const line = section.split("\n").find((l) => l.startsWith(`| ${label}`));
      expect(line, `fila "${label}"`).toBeDefined();
      const cap = /≤ ([\d,]+) (KB|MB)/.exec(line ?? "");
      expect(cap, `tope en la fila "${label}"`).not.toBeNull();
      expect(Number((cap?.[1] ?? "").replace(",", ".")), label).toBe(budgets[key]);
    }
    expect(BUDGET_KEYS).toHaveLength(Object.keys(rows).length);
  });

  test("loadBudgets rechaza claves de más o valores no numéricos", () => {
    const dir = mkdtempSync(join(tmpdir(), "lg-budgets-"));
    try {
      const extra = join(dir, "extra.json");
      writeFileSync(extra, JSON.stringify({ ...budgets, chunk_post_gzip_kb: 120 }));
      expect(() => loadBudgets(extra)).toThrow(/claves/);
      const bad = join(dir, "bad.json");
      writeFileSync(bad, JSON.stringify({ ...budgets, docente_gzip_kb: "250" }));
      expect(() => loadBudgets(bad)).toThrow(/docente_gzip_kb/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------- A2: el chequeo lee el manifiesto ----------
const BUDGETS = loadBudgets();

// Manifiesto con la forma de Vite: entrada index.html, un vendor estático, CSS y el mundo dinámico.
const manifest = (vendorFile: string): Manifest => ({
  "index.html": {
    file: "assets/index-a1.js",
    src: "index.html",
    isEntry: true,
    imports: ["_vendor-b2.js"],
    dynamicImports: ["src/world/GameCanvas.tsx"],
    css: ["assets/index-c3.css"],
  },
  "_vendor-b2.js": { file: vendorFile },
  "src/world/GameCanvas.tsx": {
    file: "assets/GameCanvas-d4.js",
    src: "src/world/GameCanvas.tsx",
    isDynamicEntry: true,
    imports: ["_vendor-b2.js", "_three-e5.js"],
    dynamicImports: ["src/world/post/Post.tsx"],
  },
  "_three-e5.js": { file: "assets/three-e5.js" },
  // Plan estetica-c M6: el postprocesado en su propio chunk (lo baja solo el tier que lo usa).
  "src/world/post/Post.tsx": {
    file: "assets/Post-g7.js",
    src: "src/world/post/Post.tsx",
    isDynamicEntry: true,
    imports: ["_vendor-b2.js"],
  },
});

const sizes = (overrides: Record<string, number>) => (file: string): number => {
  const base: Record<string, number> = {
    "assets/index-a1.js": 40 * KB,
    "assets/index-c3.css": 10 * KB,
    "assets/vendor-b2.js": 60 * KB,
    "assets/vendor-big.js": 400 * KB,
    "assets/GameCanvas-d4.js": 30 * KB,
    "assets/three-e5.js": 200 * KB,
    "assets/Post-g7.js": 20 * KB,
  };
  const size = overrides[file] ?? base[file];
  if (size === undefined) throw new Error(`fixture sin tamaño: ${file}`);
  return size;
};

describe("A2 check:budgets sobre el manifiesto de Vite", () => {
  test("el grafo estático de index.html no incluye imports dinámicos", () => {
    expect(staticClosure(manifest("assets/vendor-b2.js"), "index.html").sort()).toEqual(["_vendor-b2.js", "index.html"]);
  });

  test("un shell que entra pasa (y el chunk 3D se mide sin lo que ya cargó el shell)", () => {
    const report = checkBundle(manifest("assets/vendor-b2.js"), BUDGETS, sizes({}));
    expect(report.ok).toBe(true);
    const [shell, world] = report.results;
    expect(shell?.totalKb).toBe(110);
    expect(world?.name).toContain("src/world/GameCanvas.tsx");
    expect(world?.totalKb).toBe(230);
    expect(formatReport(report)).toMatch(/^OK +shell/);
  });

  test("un chunk inicial que pasa el tope falla nombrando el chunk", () => {
    const report = checkBundle(manifest("assets/vendor-big.js"), BUDGETS, sizes({}));
    expect(report.ok).toBe(false);
    const shell = report.results[0];
    expect(shell?.ok).toBe(false);
    expect(shell?.totalKb).toBe(450);
    const text = formatReport(report);
    expect(text).toContain("FAIL shell (index.html, carga inicial): 450 KB gzip (tope 300 KB, shell_js_css_gzip_kb)");
    expect(text).toContain("chunk más pesado: assets/vendor-big.js (_vendor-b2.js)");
  });

  test("estetica-c M2: el decodificador meshopt autoalojado suma al chunk 3D, no al shell", () => {
    const report = checkBundle(manifest("assets/vendor-b2.js"), BUDGETS, sizes({ "decoders/meshopt_decoder.module.js": 15 * KB }), undefined, undefined,
      ["decoders/meshopt_decoder.module.js"]);
    const [shell, world] = report.results;
    expect(shell?.totalKb).toBe(110);
    expect(world?.totalKb).toBe(245);
    expect(world?.chunks.some((c) => c.file === "decoders/meshopt_decoder.module.js" && c.key === "public/decoders")).toBe(true);
    const over = checkBundle(manifest("assets/vendor-b2.js"), BUDGETS, sizes({ "decoders/meshopt_decoder.module.js": 230 * KB }), undefined, undefined,
      ["decoders/meshopt_decoder.module.js"]);
    expect(over.results[1]?.ok).toBe(false);
  });

  test("el chunk 3D tiene su propio tope", () => {
    const report = checkBundle(manifest("assets/vendor-b2.js"), BUDGETS, sizes({ "assets/three-e5.js": 500 * KB }));
    expect(report.ok).toBe(false);
    expect(report.results[0]?.ok).toBe(true);
    expect(report.results[1]?.ok).toBe(false);
    expect(formatReport(report)).toContain("chunk más pesado: assets/three-e5.js (_three-e5.js)");
  });

  test("docente.html se mide contra su tope si existe; si no, queda n/a", () => {
    const m = manifest("assets/vendor-b2.js");
    expect(checkBundle(m, BUDGETS, sizes({})).skipped.join("\n")).toMatch(/docente_gzip_kb/);
    m["docente.html"] = { file: "assets/docente-f6.js", src: "docente.html", isEntry: true };
    const report = checkBundle(m, BUDGETS, sizes({ "assets/docente-f6.js": 260 * KB }));
    expect(report.results.find((r) => r.budgetKey === "docente_gzip_kb")?.ok).toBe(false);
  });

  test("un CSS compartido por dos chunks se cuenta una vez", () => {
    const m = manifest("assets/vendor-b2.js");
    m["_vendor-b2.js"] = { file: "assets/vendor-b2.js", css: ["assets/index-c3.css"] };
    expect(checkBundle(m, BUDGETS, sizes({})).results[0]?.totalKb).toBe(110);
  });

  test("F1.3 A5: three en la carga inicial del shell falla aunque entre en el tope; en el chunk 3D no", () => {
    const text = (threeIn: string) => (file: string): string =>
      file === threeIn ? 'console.warn("THREE.WebGLRenderer: Context Lost.")' : "export const x = 1;";
    const inWorld = checkBundle(manifest("assets/vendor-b2.js"), BUDGETS, sizes({}), text("assets/three-e5.js"));
    expect(inWorld.ok).toBe(true);
    expect(inWorld.violations).toEqual([]);
    const inShell = checkBundle(manifest("assets/vendor-b2.js"), BUDGETS, sizes({}), text("assets/vendor-b2.js"));
    expect(inShell.results.every((r) => r.ok)).toBe(true);
    expect(inShell.ok).toBe(false);
    expect(formatReport(inShell)).toContain("FAIL three en la carga inicial del shell: assets/vendor-b2.js (_vendor-b2.js)");
  });

  test("manifiesto sin index.html o con un import que falta falla claro", () => {
    expect(() => checkBundle({}, BUDGETS, sizes({}))).toThrow(/index.html/);
    const broken: Manifest = { "index.html": { file: "a.js", imports: ["_missing.js"] } };
    expect(() => checkBundle(broken, BUDGETS, sizes({}))).toThrow(/_missing.js/);
  });
});

// ---------- F2 A6: three/@react-three por módulos, no por texto ----------
describe("F2 A6 check:budgets con el mapa chunk → módulos", () => {
  const OWN = ["apps/web/src/main.tsx", "apps/web/src/App.tsx"];
  const clean: ChunkModules = {
    "assets/index-a1.js": OWN,
    "assets/vendor-b2.js": ["node_modules/react/index.js", "node_modules/zustand/esm/vanilla.mjs"],
    "assets/GameCanvas-d4.js": ["apps/web/src/world/GameCanvas.tsx", "node_modules/@react-three/fiber/dist/x.js"],
    "assets/three-e5.js": ["node_modules/three/build/three.module.js"],
    "assets/Post-g7.js": ["apps/web/src/world/post/Post.tsx", "node_modules/postprocessing/build/index.js"],
  };

  test("el patrón reconoce three y @react-three/*, no parecidos", () => {
    expect(THREE_MODULE.test("node_modules/three/build/three.core.js")).toBe(true);
    expect(THREE_MODULE.test("node_modules/@react-three/drei/core/x.js")).toBe(true);
    expect(THREE_MODULE.test("node_modules/@react-three/postprocessing/dist/index.js")).toBe(true);
    expect(THREE_MODULE.test("node_modules/three-stdlib/index.js")).toBe(false);
    expect(THREE_MODULE.test("node_modules/maath/index.js")).toBe(false);
    expect(THREE_MODULE.test("apps/web/src/world/three.ts")).toBe(false);
  });

  test("three solo en chunks dinámicos pasa", () => {
    const report = checkBundle(manifest("assets/vendor-b2.js"), BUDGETS, sizes({}), undefined, clean);
    expect(report.violations).toEqual([]);
    expect(report.ok).toBe(true);
  });

  test("three en el chunk de entrada falla nombrando el módulo, aunque el texto no tenga la firma", () => {
    const modules = { ...clean, "assets/index-a1.js": [...OWN, "node_modules/three/build/three.core.js"] };
    const report = checkBundle(manifest("assets/vendor-b2.js"), BUDGETS, sizes({}), () => "export const x = 1;", modules);
    expect(report.results.every((r) => r.ok)).toBe(true);
    expect(report.ok).toBe(false);
    expect(formatReport(report)).toContain("assets/index-a1.js (index.html) trae node_modules/three/build/three.core.js");
  });

  test("@react-three en un chunk estático transitivo del shell falla", () => {
    const modules = { ...clean, "assets/vendor-b2.js": [...(clean["assets/vendor-b2.js"] ?? []), "node_modules/@react-three/fiber/dist/events.js"] };
    const report = checkBundle(manifest("assets/vendor-b2.js"), BUDGETS, sizes({}), undefined, modules);
    expect(report.ok).toBe(false);
    expect(report.violations.join("\n")).toContain("assets/vendor-b2.js (_vendor-b2.js)");
  });

  test("un chunk del shell sin entrada en el mapa falla", () => {
    const partial: ChunkModules = Object.fromEntries(Object.entries(clean).filter(([file]) => file !== "assets/vendor-b2.js"));
    const report = checkBundle(manifest("assets/vendor-b2.js"), BUDGETS, sizes({}), undefined, partial);
    expect(report.ok).toBe(false);
    expect(report.violations.join("\n")).toContain("mapa de módulos sin el chunk assets/vendor-b2.js");
  });

  test("el build real: vite.config.ts registra el plugin que escribe el mapa", () => {
    const config = readFileSync(join(ROOT, "apps/web/vite.config.ts"), "utf8");
    expect(config).toContain('fileName: ".vite/chunk-modules.json"');
    expect(config).toMatch(/plugins: \[[^\]]*chunkModules\(\)/);
  });
});

// ---------- A2 de punta a punta: archivos reales, gzip real ----------
// ---------- plan estetica-c M6: el postprocesado en su propio chunk (03 §2.9, D-160) ----------
describe("estetica-c M6: low y dialog-only no descargan el postprocesado", () => {
  const modules: ChunkModules = {
    "assets/index-a1.js": ["apps/web/src/main.tsx"],
    "assets/vendor-b2.js": ["node_modules/react/index.js"],
    "assets/GameCanvas-d4.js": ["apps/web/src/world/GameCanvas.tsx", "node_modules/@react-three/fiber/dist/x.js"],
    "assets/three-e5.js": ["node_modules/three/build/three.module.js"],
    "assets/Post-g7.js": ["apps/web/src/world/post/Post.tsx", "node_modules/@react-three/postprocessing/dist/index.js", "node_modules/postprocessing/build/index.js"],
  };

  test("el patrón reconoce postprocessing y su envoltorio de R3F, no parecidos", () => {
    expect(POST_MODULE.test("node_modules/postprocessing/build/index.js")).toBe(true);
    expect(POST_MODULE.test("node_modules/@react-three/postprocessing/dist/index.js")).toBe(true);
    expect(POST_MODULE.test("node_modules/@react-three/fiber/dist/x.js")).toBe(false);
    expect(POST_MODULE.test("apps/web/src/world/post/Post.tsx")).toBe(false);
  });

  test("Post como entrada dinámica aparte pasa, y se mide como chunk del mundo", () => {
    const report = checkBundle(manifest("assets/vendor-b2.js"), BUDGETS, sizes({}), undefined, modules);
    expect(report.violations).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.results.some((r) => r.name.includes(POST_ENTRY))).toBe(true);
  });

  test("dientes: Post importado estático desde el canvas falla", () => {
    const m = manifest("assets/vendor-b2.js");
    m["src/world/GameCanvas.tsx"] = {
      file: "assets/GameCanvas-d4.js", src: "src/world/GameCanvas.tsx", isDynamicEntry: true, imports: ["_vendor-b2.js", "_three-e5.js", POST_ENTRY],
    };
    m[POST_ENTRY] = { file: "assets/Post-g7.js", src: POST_ENTRY, imports: ["_vendor-b2.js"] };
    const report = checkBundle(m, BUDGETS, sizes({}), undefined, modules);
    expect(report.ok).toBe(false);
    expect(report.violations.join("\n")).toContain("postprocesado sin chunk propio");
    expect(report.violations.join("\n")).toContain(`postprocesado en el grafo estático del canvas: ${POST_ENTRY}`);
  });

  test("dientes: módulos de postprocessing en un chunk estático del canvas fallan aunque Post siga aparte", () => {
    const leaky = { ...modules, "assets/three-e5.js": ["node_modules/three/build/three.module.js", "node_modules/postprocessing/build/index.js"] };
    const report = checkBundle(manifest("assets/vendor-b2.js"), BUDGETS, sizes({}), undefined, leaky);
    expect(report.ok).toBe(false);
    expect(report.violations.join("\n")).toContain("assets/three-e5.js (_three-e5.js) trae node_modules/postprocessing/build/index.js");
  });

  test("dientes (M7, nota 4 de QA): con módulos del mundo y sin la clave del canvas, falla; sin mundo, no hay nada que chequear", () => {
    const full = manifest("assets/vendor-b2.js");
    const canvas = full[WORLD_CANVAS_ENTRY] as ManifestChunk;
    const m: Manifest = Object.fromEntries(Object.entries(full).filter(([k]) => k !== WORLD_CANVAS_ENTRY));
    m["src/world/Canvas3D.tsx"] = { ...canvas, src: "src/world/Canvas3D.tsx" };
    (m["index.html"] as ManifestChunk).dynamicImports = ["src/world/Canvas3D.tsx"];
    const v = checkPostChunk(m, staticClosure(m, "index.html"), modules);
    expect(v).toHaveLength(1);
    expect(v[0]).toContain(`falta la entrada del canvas ${WORLD_CANVAS_ENTRY}`);
    expect(checkBundle(m, BUDGETS, sizes({}), undefined, modules).ok).toBe(false);
    expect(checkPostChunk({ "index.html": { file: "assets/index-a1.js", src: "index.html", isEntry: true } }, ["index.html"])).toEqual([]);
  });

  test("el canvas real carga Post con import() y React.lazy (nunca estático)", () => {
    const src = readFileSync(join(ROOT, "apps/web/src/world/GameCanvas.tsx"), "utf8");
    expect(src).toContain('lazy(() => import("./post/Post"))');
    expect(src).not.toMatch(/^import [^;]*from "\.\/post\/Post";/m);
  });
});

describe("A2 run() sobre un dist de fixture en disco", () => {
  const dir = mkdtempSync(join(tmpdir(), "lg-dist-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  // Bytes pseudoaleatorios (LCG con semilla): no se comprimen, el gzip queda ≈ al tamaño.
  const noise = (bytes: number): Buffer => {
    const buf = Buffer.alloc(bytes);
    let s = 12345;
    for (let i = 0; i < bytes; i++) {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      buf[i] = s >>> 24;
    }
    return buf;
  };
  const writeDist = (
    name: string,
    entryBytes: number,
    modules: ChunkModules | null = { "assets/index-x.js": ["apps/web/src/main.tsx"] },
  ): string => {
    const dist = join(dir, name);
    mkdirSync(join(dist, ".vite"), { recursive: true });
    mkdirSync(join(dist, "assets"), { recursive: true });
    writeFileSync(join(dist, "assets/index-x.js"), noise(entryBytes));
    const m: Manifest = { "index.html": { file: "assets/index-x.js", src: "index.html", isEntry: true } };
    writeFileSync(join(dist, ".vite/manifest.json"), JSON.stringify(m));
    if (modules !== null) writeFileSync(join(dist, ".vite/chunk-modules.json"), JSON.stringify(modules));
    return dist;
  };

  test("un chunk inicial de ~320 KB gzip sale con 1 y nombra el archivo", () => {
    const lines: string[] = [];
    expect(run(writeDist("over", 320 * KB), undefined, (l) => lines.push(l))).toBe(1);
    expect(lines.join("\n")).toMatch(/FAIL shell[\s\S]*chunk más pesado: assets\/index-x\.js \(index\.html\)/);
  });

  test("uno de ~100 KB sale con 0", () => {
    const lines: string[] = [];
    expect(run(writeDist("ok", 100 * KB), undefined, (l) => lines.push(l))).toBe(0);
    expect(lines.join("\n")).toMatch(/^OK +shell/);
  });

  test("F2 A6: sin chunk-modules.json sale con 1 (nada de falso verde)", () => {
    const lines: string[] = [];
    expect(run(writeDist("nomap", 100 * KB, null), undefined, (l) => lines.push(l))).toBe(1);
    expect(lines.join("\n")).toContain("chunk-modules.json");
  });

  test("F2 A6: un mapa de módulos con three en el shell sale con 1", () => {
    const lines: string[] = [];
    const dist = writeDist("threeinshell", 100 * KB, { "assets/index-x.js": ["apps/web/src/main.tsx", "node_modules/three/build/three.core.js"] });
    expect(run(dist, undefined, (l) => lines.push(l))).toBe(1);
    expect(lines.join("\n")).toContain("node_modules/three/build/three.core.js");
  });

  test("sin manifiesto sale con 1 y dice qué correr", () => {
    const lines: string[] = [];
    expect(run(join(dir, "nope"), undefined, (l) => lines.push(l))).toBe(1);
    expect(lines.join("\n")).toContain("npm run build");
  });
});

// ---------- Cableado: verify corre check:budgets después del build; check:dev-only (FD0) dentro ----------
describe("scripts raíz", () => {
  const scripts = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;

  test("check:budgets corre bundle-size.ts y el paso check:dev-only", () => {
    expect(scripts["check:budgets"]).toContain("scripts/budgets/bundle-size.ts");
    expect(scripts["check:budgets"]).toContain("npm run check:dev-only");
  });

  test("check:dev-only corre el detector del modo director (FD0, 03 §6.5.1), no el centinela de F1.1b", () => {
    expect(scripts["check:dev-only"]).toBe("node scripts/budgets/dev-only.ts");
  });

  test("dev:director resuelve a vite --config tooling/director/vite.config.ts (FD0 A2)", () => {
    expect(scripts["dev:director"]).toBe("vite --config tooling/director/vite.config.ts");
    expect(scripts["director"]).toBe("node tooling/director/src/cli.ts");
  });

  test("verify mide el bundle después de construirlo", () => {
    const verify = scripts["verify"] ?? "";
    expect(verify.indexOf("npm run build")).toBeGreaterThan(-1);
    expect(verify.indexOf("npm run check:budgets")).toBeGreaterThan(verify.indexOf("npm run build"));
  });
});
