// Test de límites de módulos y costuras (F1.1a; 03 §4.3, §4.3.1, §4.3.2; P0 §2.4).
// Corre la config REAL (eslint.config.js) por la API de ESLint con texto en memoria y un
// filePath virtual dentro de la carpeta destino. Cada caso prohibido tiene que fallar con el
// ruleId esperado (no con cualquier error) y cada import por ruta apunta a un archivo que existe.
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint, type Linter } from "eslint";
import { beforeAll, describe, expect, test } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const ZONE = "import-x/no-restricted-paths";
const IMP = "no-restricted-imports";
const TS_IMP = "@typescript-eslint/no-restricted-imports";
const GLOBALS = "no-restricted-globals";
const PROPS = "no-restricted-properties";
const SYNTAX = "no-restricted-syntax";
const BOUNDARY_RULES = [ZONE, IMP, TS_IMP, GLOBALS, PROPS, SYNTAX];
const SEAM_RULES = [IMP, TS_IMP, PROPS, SYNTAX];

// Archivos virtuales (no existen en disco; sus carpetas sí).
const WEB = "apps/web/src";
const F = {
  core: "packages/core/src/__probe__.ts",
  schema: "packages/content-schema/src/__probe__.ts",
  protocol: "packages/protocol/src/__probe__.ts",
  server: "apps/server/src/__probe__.ts",
  scripts: "scripts/lint/__probe__.ts",
  webRoot: `${WEB}/__probe__.tsx`,
  boot: `${WEB}/boot/__probe__.ts`,
  webConfig: "apps/web/__probe__.ts",
  ui: `${WEB}/ui/__probe__.tsx`,
  world: `${WEB}/world/__probe__.tsx`,
  camera: `${WEB}/world/camera/__probe__.tsx`,
  services: `${WEB}/services/__probe__.ts`,
  input: `${WEB}/services/input/__probe__.ts`,
  audio: `${WEB}/services/audio/__probe__.ts`,
  platform: `${WEB}/services/platform/__probe__.ts`,
  state: `${WEB}/state/__probe__.ts`,
  teacher: `${WEB}/teacher/__probe__.tsx`,
  dev: `${WEB}/dev/director/__probe__.tsx`,
} as const;

const imp = (spec: string): string => `import * as m from "${spec}";\nexport { m };\n`;
const named = (name: string, spec: string): string => `import { ${name} } from "${spec}";\nexport { ${name} };\n`;
const typeImp = (spec: string): string => `import type { PACKAGE_NAME } from "${spec}";\nexport type T = typeof PACKAGE_NAME;\n`;
const expr = (code: string): string => `export const probe = () => ${code};\n`;

interface Case {
  name: string;
  file: string;
  code: string;
  /** ruleId esperado; con varios, alcanza con que dispare uno. */
  rule: string | string[];
  /** fragmento del mensaje esperado. */
  msg?: string;
}

// ---------- celdas "No puede importar" de 03 §4.3 (y costuras R5, R10, R11, R13, R15) ----------
const FORBIDDEN: Case[] = [
  // packages/core (R4)
  { name: "core -> react", file: F.core, code: imp("react"), rule: IMP, msg: "R4" },
  { name: "core -> three", file: F.core, code: imp("three"), rule: IMP, msg: "R4" },
  { name: "core -> @react-three/fiber", file: F.core, code: imp("@react-three/fiber"), rule: IMP, msg: "R4" },
  { name: "core -> zustand", file: F.core, code: imp("zustand"), rule: IMP, msg: "R4" },
  { name: "core -> node:fs", file: F.core, code: imp("node:fs"), rule: IMP, msg: "R4" },
  { name: "core -> apps/* (relativo)", file: F.core, code: imp("../../../apps/web/src/ui/index"), rule: ZONE, msg: "los paquetes no importan apps/" },
  { name: "core -> @lg/content-schema (paquete)", file: F.core, code: imp("@lg/content-schema"), rule: ZONE, msg: "core no depende de content-schema" },
  { name: "core -> content-schema (relativo)", file: F.core, code: imp("../../content-schema/src/index"), rule: ZONE, msg: "core no depende de content-schema" },
  { name: "core -> tooling/director", file: F.core, code: imp("../../../tooling/director/index"), rule: ZONE, msg: "ADR-026" },
  { name: "core: window", file: F.core, code: expr("window"), rule: GLOBALS },
  { name: "core: document", file: F.core, code: expr("document"), rule: GLOBALS },
  { name: "core: fetch", file: F.core, code: expr('fetch("/x")'), rule: GLOBALS },
  { name: "core: process (global de Node)", file: F.core, code: expr("process.env.X"), rule: GLOBALS },
  { name: "core: Date.now()", file: F.core, code: expr("Date.now()"), rule: PROPS, msg: "Clock" },
  { name: "core: Math.random()", file: F.core, code: expr("Math.random()"), rule: PROPS, msg: "Rng" },
  { name: "core: new Date()", file: F.core, code: expr("new Date()"), rule: SYNTAX, msg: "Clock" },
  // packages/content-schema
  { name: "content-schema -> apps/*", file: F.schema, code: imp("../../../apps/server/src/index"), rule: ZONE },
  { name: "content-schema -> react", file: F.schema, code: imp("react"), rule: IMP },
  { name: "content-schema -> three", file: F.schema, code: imp("three"), rule: IMP },
  { name: "content-schema -> zustand", file: F.schema, code: imp("zustand"), rule: IMP },
  // packages/protocol
  { name: "protocol -> core (relativo)", file: F.protocol, code: imp("../../core/src/index"), rule: ZONE, msg: "protocol solo depende de zod" },
  { name: "protocol -> @lg/core (paquete)", file: F.protocol, code: imp("@lg/core"), rule: IMP, msg: "protocol solo importa zod" },
  { name: "protocol -> yaml", file: F.protocol, code: imp("yaml"), rule: IMP },
  { name: "protocol -> react", file: F.protocol, code: imp("react"), rule: IMP },
  // apps/web/src/ui
  { name: "ui -> world (relativo)", file: F.ui, code: imp("../world/index"), rule: ZONE, msg: "R3" },
  { name: "ui -> world (directorio)", file: F.ui, code: imp("../world"), rule: ZONE, msg: "R3" },
  { name: "ui -> world (alias @world)", file: F.ui, code: imp("@world/index"), rule: ZONE, msg: "R3" },
  { name: "ui -> world (relativo profundo ../../src/world)", file: F.ui, code: imp("../../src/world/index"), rule: ZONE, msg: "R3" },
  { name: "ui -> services", file: F.ui, code: imp("../services/index"), rule: ZONE, msg: "ui/ no importa services/" },
  { name: "ui -> state/slices", file: F.ui, code: imp("../state/slices/index"), rule: ZONE, msg: "R14" },
  { name: "ui -> state/store.ts", file: F.ui, code: imp("../state/store"), rule: ZONE, msg: "R14" },
  { name: "ui -> state/store.ts (alias @state)", file: F.ui, code: imp("@state/store"), rule: ZONE, msg: "R14" },
  { name: "ui -> dev", file: F.ui, code: imp("../dev/director/index"), rule: ZONE, msg: "ADR-026" },
  { name: "ui -> three (nota 1 de 03 §4.3.1)", file: F.ui, code: imp("three"), rule: TS_IMP, msg: "ui/ no importa three" },
  { name: "ui -> @react-three/fiber", file: F.ui, code: imp("@react-three/fiber"), rule: TS_IMP },
  { name: "ui -> @lg/core como valor", file: F.ui, code: named("PACKAGE_NAME", "@lg/core"), rule: TS_IMP, msg: "solo como tipos" },
  { name: "ui -> apps/server (apps/web -> apps/server)", file: F.ui, code: imp("../../../server/src/index"), rule: ZONE, msg: "web no importa server" },
  { name: "ui -> tooling/director (apps/web -> tooling)", file: F.ui, code: imp("../../../../tooling/director/index"), rule: ZONE, msg: "ADR-026" },
  // apps/web/src/world
  { name: "world -> ui", file: F.world, code: imp("../ui/index"), rule: ZONE, msg: "R3" },
  { name: "world -> ui (alias @ui)", file: F.world, code: imp("@ui/index"), rule: ZONE, msg: "R3" },
  { name: "world -> services", file: F.world, code: imp("../services/index"), rule: ZONE, msg: "world/ no importa services/" },
  { name: "world -> state/slices", file: F.world, code: imp("../state/slices/index"), rule: ZONE },
  { name: "world -> state/store.ts", file: F.world, code: imp("../state/store"), rule: ZONE },
  { name: "world -> state/actions.ts", file: F.world, code: imp("../state/actions"), rule: ZONE },
  { name: "world -> dev", file: F.world, code: imp("../dev/director/index"), rule: ZONE, msg: "ADR-026" },
  { name: "world -> @lg/core como valor", file: F.world, code: named("PACKAGE_NAME", "@lg/core"), rule: TS_IMP, msg: "solo como tipos" },
  // apps/web/src/services
  { name: "services -> ui", file: F.services, code: imp("../ui/index"), rule: ZONE },
  { name: "services -> world", file: F.services, code: imp("../world/index"), rule: ZONE },
  { name: "services -> dev", file: F.services, code: imp("../dev/director/index"), rule: ZONE, msg: "ADR-026" },
  // apps/web/src/state
  { name: "state -> ui", file: F.state, code: imp("../ui/index"), rule: ZONE },
  { name: "state -> world", file: F.state, code: imp("../world/index"), rule: ZONE },
  { name: "state -> services", file: F.state, code: imp("../services/index"), rule: ZONE, msg: "state/ no importa capas superiores" },
  { name: "state -> dev", file: F.state, code: imp("../dev/director/index"), rule: ZONE, msg: "ADR-026" },
  // apps/web/src/teacher
  { name: "teacher -> world", file: F.teacher, code: imp("../world/index"), rule: ZONE },
  { name: "teacher -> services", file: F.teacher, code: imp("../services/index"), rule: ZONE },
  { name: "teacher -> state", file: F.teacher, code: imp("../state/selectors/index"), rule: ZONE },
  { name: "teacher -> dev", file: F.teacher, code: imp("../dev/director/index"), rule: ZONE, msg: "ADR-026" },
  { name: "teacher -> ui fuera de primitives", file: F.teacher, code: imp("../ui/index"), rule: ZONE, msg: "ui/primitives" },
  { name: "teacher -> three", file: F.teacher, code: imp("three"), rule: TS_IMP },
  // apps/web/src/dev (modo director)
  { name: "dev -> world", file: F.dev, code: imp("../../world/index"), rule: ZONE, msg: "ADR-026" },
  { name: "dev -> services", file: F.dev, code: imp("../../services/index"), rule: ZONE, msg: "ADR-026" },
  { name: "dev -> state/slices", file: F.dev, code: imp("../../state/slices/index"), rule: ZONE, msg: "ADR-026" },
  { name: "dev -> state/store.ts", file: F.dev, code: imp("../../state/store"), rule: ZONE, msg: "ADR-026" },
  { name: "dev -> ui fuera de primitives", file: F.dev, code: imp("../../ui/index"), rule: ZONE, msg: "ADR-026" },
  { name: "dev -> three", file: F.dev, code: imp("three"), rule: TS_IMP },
  { name: "dev -> @anthropic-ai/*", file: F.dev, code: imp("@anthropic-ai/sdk"), rule: TS_IMP },
  { name: "dev -> @modelcontextprotocol/*", file: F.dev, code: imp("@modelcontextprotocol/sdk"), rule: TS_IMP },
  // apps/server, raíz de composición, scripts, config de apps/web
  { name: "server -> apps/web", file: F.server, code: imp("../../web/src/ui/index"), rule: ZONE, msg: "server no importa web" },
  { name: "server -> tooling/director", file: F.server, code: imp("../../../tooling/director/index"), rule: ZONE, msg: "ADR-026" },
  { name: "raíz de composición -> apps/server", file: F.webRoot, code: imp("../../server/src/index"), rule: ZONE },
  { name: "raíz de composición -> tooling/director", file: F.boot, code: imp("../../../../tooling/director/index"), rule: ZONE },
  { name: "apps/web (config) -> tooling/director", file: F.webConfig, code: imp("../../tooling/director/index"), rule: ZONE },
  { name: "scripts -> tooling/director", file: F.scripts, code: imp("../../tooling/director/index"), rule: ZONE },
  // R5: efectos solo en services/
  ...(["fetch", "WebSocket", "indexedDB", "localStorage", "sessionStorage"] as const).flatMap((g) =>
    (["ui", "world", "state"] as const).map((layer): Case => ({ name: `R5: ${g} en ${layer}/`, file: F[layer], code: expr(g), rule: GLOBALS })),
  ),
];

// ---------- costuras R10, R11, R13, R15: fallan fuera de su carpeta ----------
const SEAM_FORBIDDEN: Case[] = [
  // R15
  { name: "R15: @tauri-apps en ui/", file: F.ui, code: named("invoke", "@tauri-apps/api/core"), rule: [TS_IMP, IMP], msg: "R15" },
  { name: "R15: @tauri-apps en world/", file: F.world, code: named("invoke", "@tauri-apps/api/core"), rule: [TS_IMP, IMP], msg: "R15" },
  { name: "R15: @tauri-apps en services/input/", file: F.input, code: named("invoke", "@tauri-apps/api/core"), rule: IMP, msg: "R15" },
  { name: "R15: @capacitor en ui/", file: F.ui, code: 'import "@capacitor/core";\n', rule: [TS_IMP, IMP], msg: "R15" },
  { name: "R15: navigator.xr en ui/", file: F.ui, code: expr("navigator.xr"), rule: PROPS, msg: "R15" },
  { name: "R15: navigator.xr en services/input/", file: F.input, code: expr("navigator.xr"), rule: PROPS, msg: "R15" },
  // R10
  { name: "R10: keydown en ui/", file: F.ui, code: expr('window.addEventListener("keydown", () => {})'), rule: SYNTAX, msg: "R10" },
  { name: "R10: keydown en world/", file: F.world, code: expr('window.addEventListener("keydown", () => {})'), rule: SYNTAX, msg: "R10" },
  { name: "R10: pointerdown en services/", file: F.services, code: expr('document.addEventListener("pointerdown", () => {})'), rule: SYNTAX, msg: "R10" },
  { name: "R10: evento no literal en ui/", file: F.ui, code: expr("window.addEventListener(String(1), () => {})"), rule: SYNTAX, msg: "no literal" },
  { name: "R10: keydown en services/audio/", file: F.audio, code: expr('window.addEventListener("keydown", () => {})'), rule: SYNTAX, msg: "R10" },
  { name: "R10: keydown en world/camera/", file: F.camera, code: expr('window.addEventListener("keydown", () => {})'), rule: SYNTAX, msg: "R10" },
  { name: "R10: keydown en services/platform/", file: F.platform, code: expr('window.addEventListener("keydown", () => {})'), rule: SYNTAX, msg: "R10" },
  { name: "R10: navigator.getGamepads en ui/", file: F.ui, code: expr("navigator.getGamepads()"), rule: PROPS, msg: "R10" },
  { name: "R10: navigator.getGamepads en services/platform/", file: F.platform, code: expr("navigator.getGamepads()"), rule: PROPS, msg: "R10" },
  // R11
  { name: "R11: import OrthographicCamera en world/", file: F.world, code: named("OrthographicCamera", "three"), rule: IMP, msg: "R11" },
  { name: "R11: new THREE.OrthographicCamera() en world/", file: F.world, code: `import * as THREE from "three";\n${expr("new THREE.OrthographicCamera()")}`, rule: SYNTAX, msg: "R11" },
  { name: "R11: new OrthographicCamera() en world/", file: F.world, code: expr("new OrthographicCamera()"), rule: SYNTAX, msg: "R11" },
  { name: "R11: drei OrbitControls en world/", file: F.world, code: named("OrbitControls", "@react-three/drei"), rule: IMP, msg: "R11" },
  { name: "R11: <Canvas orthographic> en world/", file: F.world, code: expr("<Canvas orthographic />"), rule: SYNTAX, msg: "CameraRig" },
  { name: "R11: <orthographicCamera> en world/", file: F.world, code: expr("<orthographicCamera />"), rule: SYNTAX, msg: "R11" },
  { name: "R11: import OrthographicCamera en services/platform/", file: F.platform, code: named("OrthographicCamera", "three"), rule: IMP, msg: "R11" },
  // R13
  { name: "R13: new AudioContext en services/", file: F.services, code: expr("new AudioContext()"), rule: SYNTAX, msg: "R13" },
  { name: "R13: new window.AudioContext en ui/", file: F.ui, code: expr("new window.AudioContext()"), rule: SYNTAX, msg: "R13" },
  { name: "R13: new AudioContext en services/input/", file: F.input, code: expr("new AudioContext()"), rule: SYNTAX, msg: "R13" },
  { name: "R13: new AudioContext en world/camera/", file: F.camera, code: expr("new AudioContext()"), rule: SYNTAX, msg: "R13" },
  { name: "R13: new Audio en services/platform/", file: F.platform, code: expr('new Audio("x.ogg")'), rule: SYNTAX, msg: "R13" },
];

// ---------- costuras: pasan dentro de su carpeta (cero mensajes de las reglas de costura) ----------
const SEAM_ALLOWED: Omit<Case, "rule">[] = [
  { name: "R15: @tauri-apps en services/platform/", file: F.platform, code: named("invoke", "@tauri-apps/api/core") },
  { name: "R15: @capacitor en services/platform/", file: F.platform, code: 'import "@capacitor/core";\n' },
  { name: "R15: navigator.xr en services/platform/", file: F.platform, code: expr("navigator.xr") },
  { name: "R10: keydown en services/input/", file: F.input, code: expr('window.addEventListener("keydown", () => {})') },
  { name: "R10: evento no literal en services/input/", file: F.input, code: expr("window.addEventListener(String(1), () => {})") },
  { name: "R10: navigator.getGamepads en services/input/", file: F.input, code: expr("navigator.getGamepads()") },
  { name: "R10: onKeyDown de JSX en ui/ (no es listener de dispositivo)", file: F.ui, code: "const f = () => {};\nexport const B = () => <button onKeyDown={f} />;\n" },
  { name: "R11: import OrthographicCamera en world/camera/", file: F.camera, code: named("OrthographicCamera", "three") },
  { name: "R11: new THREE.OrthographicCamera() en world/camera/", file: F.camera, code: `import * as THREE from "three";\n${expr("new THREE.OrthographicCamera()")}` },
  { name: "R11: drei OrbitControls en world/camera/", file: F.camera, code: named("OrbitControls", "@react-three/drei") },
  { name: "R11: <Canvas orthographic> en world/camera/", file: F.camera, code: expr("<Canvas orthographic />") },
  { name: "R13: new AudioContext en services/audio/", file: F.audio, code: expr("new AudioContext()") },
];

// ---------- un import permitido por fila de 03 §4.3 (cero mensajes de reglas de límites) ----------
const ALLOWED: Omit<Case, "rule">[] = [
  { name: "core -> @lg/protocol", file: F.core, code: imp("@lg/protocol") },
  { name: "core -> protocol (relativo)", file: F.core, code: imp("../../protocol/src/index") },
  { name: "content-schema -> zod", file: F.schema, code: imp("zod") },
  { name: "content-schema -> yaml", file: F.schema, code: imp("yaml") },
  { name: "content-schema -> @lg/core", file: F.schema, code: imp("@lg/core") },
  { name: "protocol -> zod", file: F.protocol, code: imp("zod") },
  { name: "raíz de composición -> ui/", file: F.webRoot, code: imp("./ui/index") },
  { name: "raíz de composición -> world/", file: F.webRoot, code: imp("./world/index") },
  { name: "raíz de composición -> services/", file: F.boot, code: imp("../services/index") },
  { name: "raíz de composición -> dev/director", file: F.boot, code: imp("../dev/director/index") },
  { name: "ui -> state/selectors", file: F.ui, code: imp("../state/selectors/index") },
  { name: "ui -> state/selectors (alias @state)", file: F.ui, code: imp("@state/selectors/index") },
  { name: "ui -> state/actions.ts", file: F.ui, code: imp("../state/actions") },
  { name: "ui -> ui/primitives", file: F.ui, code: imp("./primitives/index") },
  { name: "ui -> i18n", file: F.ui, code: imp("../i18n/index") },
  { name: "ui -> @lg/core solo tipos", file: F.ui, code: typeImp("@lg/core") },
  { name: "world -> state/bridge.ts", file: F.world, code: imp("../state/bridge") },
  { name: "world -> state/selectors", file: F.world, code: imp("../state/selectors/index") },
  { name: "world -> @lg/core solo tipos", file: F.world, code: typeImp("@lg/core") },
  { name: "world -> three", file: F.world, code: named("Mesh", "three") },
  { name: "services -> state/", file: F.services, code: imp("../state/store") },
  { name: "services -> @lg/core", file: F.services, code: named("PACKAGE_NAME", "@lg/core") },
  { name: "state -> @lg/core", file: F.state, code: named("PACKAGE_NAME", "@lg/core") },
  { name: "state -> @lg/protocol", file: F.state, code: imp("@lg/protocol") },
  { name: "teacher -> ui/primitives", file: F.teacher, code: imp("../ui/primitives/index") },
  { name: "teacher -> @lg/protocol", file: F.teacher, code: imp("@lg/protocol") },
  { name: "teacher -> i18n", file: F.teacher, code: imp("../i18n/index") },
  { name: "dev -> state/selectors", file: F.dev, code: imp("../../state/selectors/index") },
  { name: "dev -> state/actions.ts", file: F.dev, code: imp("../../state/actions") },
  { name: "dev -> ui/primitives", file: F.dev, code: imp("../../ui/primitives/index") },
  { name: "dev -> @lg/protocol", file: F.dev, code: imp("@lg/protocol") },
  { name: "server -> @lg/core", file: F.server, code: imp("@lg/core") },
  { name: "server -> core (relativo)", file: F.server, code: imp("../../../packages/core/src/index") },
];

// ---------- A4: el mismo código no determinista pasa en apps/server ----------
const NONDETERMINISM = "export const t = Date.now();\nexport const r = Math.random();\nexport const d = new Date();\n";

// ---------- resolución de destinos (guardia contra falso verde) ----------
const WEB_ALIASES: Record<string, string> = {
  "@ui/": "ui", "@world/": "world", "@state/": "state", "@services/": "services", "@i18n/": "i18n", "@teacher/": "teacher",
};
const SPEC_RE = /(?:from|import)\s+"([^"]+)"/g;
const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

/** Ruta absoluta base de un import por ruta (relativo, alias o @lg/*); null para paquetes de npm. */
function pathTarget(file: string, spec: string): string | null {
  if (spec.startsWith(".")) return resolve(ROOT, dirname(file), spec);
  const alias = Object.keys(WEB_ALIASES).find((a) => spec.startsWith(a));
  if (alias) return resolve(ROOT, WEB, WEB_ALIASES[alias] ?? "", spec.slice(alias.length));
  if (spec.startsWith("@lg/")) return resolve(ROOT, "packages", spec.slice(4), "src/index.ts");
  return null;
}

const isFile = (p: string): boolean => existsSync(p) && statSync(p).isFile();
const existsWithExt = (base: string): boolean => EXTENSIONS.some((ext) => isFile(base + ext));

function pathTargets(c: { file: string; code: string }): string[] {
  return [...c.code.matchAll(SPEC_RE)]
    .map((m) => pathTarget(c.file, m[1] ?? ""))
    .filter((t): t is string => t !== null);
}

// ---------- corrida ----------
let eslint: ESLint;
const lint = async (file: string, code: string): Promise<Linter.LintMessage[]> => {
  const [result] = await eslint.lintText(code, { filePath: resolve(ROOT, file) });
  if (!result) throw new Error(`sin resultado para ${file}`);
  const fatal = result.messages.filter((m) => m.fatal);
  expect(fatal, `error de parseo en ${file}`).toEqual([]);
  return result.messages;
};
const describeMsgs = (msgs: Linter.LintMessage[]): string => msgs.map((m) => `${m.ruleId}: ${m.message}`).join(" | ") || "(sin mensajes)";

beforeAll(() => {
  eslint = new ESLint({ cwd: ROOT });
});

describe("guardia: cada import por ruta de las fixtures apunta a un archivo que existe", () => {
  const all = [...FORBIDDEN, ...SEAM_FORBIDDEN, ...ALLOWED];
  test.each(all.filter((c) => pathTargets(c).length > 0).map((c) => [c.name, c] as const))("%s", (_name, c) => {
    for (const target of pathTargets(c)) expect(existsWithExt(target), `no existe ${target}`).toBe(true);
  });
  test("los marcadores clave existen (world/ y tooling/director)", () => {
    expect(existsSync(resolve(ROOT, WEB, "world/index.ts"))).toBe(true);
    expect(existsSync(resolve(ROOT, "tooling/director/index.ts"))).toBe(true);
  });
});

describe("A2/A3/A4: celdas prohibidas fallan con el ruleId esperado", () => {
  test.each(FORBIDDEN.map((c) => [c.name, c] as const))("%s", async (_name, c) => {
    const msgs = await lint(c.file, c.code);
    const rules = Array.isArray(c.rule) ? c.rule : [c.rule];
    const hits = msgs.filter((m) => m.ruleId !== null && rules.includes(m.ruleId));
    expect(hits.length, describeMsgs(msgs)).toBeGreaterThan(0);
    if (c.msg) expect(hits.some((m) => m.message.includes(c.msg ?? "")), describeMsgs(hits)).toBe(true);
  });
});

describe("A2: un import permitido por fila pasa", () => {
  test.each(ALLOWED.map((c) => [c.name, c] as const))("%s", async (_name, c) => {
    const msgs = await lint(c.file, c.code);
    const hits = msgs.filter((m) => m.ruleId !== null && BOUNDARY_RULES.includes(m.ruleId));
    expect(hits, describeMsgs(hits)).toEqual([]);
  });
});

describe("A4: Date.now(), Math.random() y new Date()", () => {
  test("fallan en packages/core", async () => {
    const msgs = await lint(F.core, NONDETERMINISM);
    expect(msgs.filter((m) => m.ruleId === PROPS)).toHaveLength(2);
    expect(msgs.filter((m) => m.ruleId === SYNTAX)).toHaveLength(1);
  });
  test("pasan en apps/server", async () => {
    const msgs = await lint(F.server, NONDETERMINISM);
    expect(msgs, describeMsgs(msgs)).toEqual([]);
  });
});

describe("A5: costuras fallan fuera de su carpeta", () => {
  test.each(SEAM_FORBIDDEN.map((c) => [c.name, c] as const))("%s", async (_name, c) => {
    const msgs = await lint(c.file, c.code);
    const rules = Array.isArray(c.rule) ? c.rule : [c.rule];
    const hits = msgs.filter((m) => m.ruleId !== null && rules.includes(m.ruleId));
    expect(hits.length, describeMsgs(msgs)).toBeGreaterThan(0);
    if (c.msg) expect(hits.some((m) => m.message.includes(c.msg ?? "")), describeMsgs(hits)).toBe(true);
  });
});

// ---------- F1.3 A2: archivos REALES de ui/ y world/ en el set de fixtures ----------
// El código real (no un __probe__ virtual) lintea limpio en su ruta, y el mismo archivo con un import cruzado
// agregado falla por la regla de límites. Así el test sigue midiendo cuando ui/ y world/ crecen.
const REAL_UI = `${WEB}/ui/shell/Shell.tsx`;
const REAL_WORLD = `${WEB}/world/GameCanvas.tsx`;
const realCode = (file: string): string => readFileSync(resolve(ROOT, file), "utf8");
const REAL_FORBIDDEN: Case[] = [
  { name: "ui/shell/Shell.tsx real -> world/GameCanvas (relativo)", file: REAL_UI, code: "import \"../../world/GameCanvas\";\n", rule: ZONE, msg: "R3" },
  { name: "ui/shell/Shell.tsx real -> world (alias @world)", file: REAL_UI, code: "import \"@world/GameCanvas\";\n", rule: ZONE, msg: "R3" },
  { name: "ui/shell/Shell.tsx real -> state/store.ts", file: REAL_UI, code: "import \"../../state/store\";\n", rule: ZONE, msg: "R14" },
  { name: "ui/shell/Shell.tsx real -> services/quality", file: REAL_UI, code: "import \"../../services/quality/index\";\n", rule: ZONE, msg: "ui/ no importa services/" },
  { name: "world/GameCanvas.tsx real -> ui/shell/Shell", file: REAL_WORLD, code: "import \"../ui/shell/Shell\";\n", rule: ZONE, msg: "R3" },
];

describe("F1.3 A2: archivos reales de ui/ y world/", () => {
  test("los archivos reales y los destinos de sus imports cruzados existen (guardia contra falso verde)", () => {
    for (const f of [REAL_UI, REAL_WORLD]) expect(isFile(resolve(ROOT, f)), f).toBe(true);
    for (const c of REAL_FORBIDDEN) for (const target of pathTargets(c)) expect(existsWithExt(target), `no existe ${target}`).toBe(true);
  });

  test.each([REAL_UI, REAL_WORLD])("%s lintea limpio tal como está", async (file) => {
    const msgs = await lint(file, realCode(file));
    const hits = msgs.filter((m) => m.ruleId !== null && BOUNDARY_RULES.includes(m.ruleId));
    expect(hits, describeMsgs(hits)).toEqual([]);
  });

  test.each(REAL_FORBIDDEN.map((c) => [c.name, c] as const))("%s falla con el ruleId esperado", async (_name, c) => {
    const msgs = await lint(c.file, realCode(c.file) + c.code);
    const hits = msgs.filter((m) => m.ruleId === c.rule);
    expect(hits.length, describeMsgs(msgs)).toBeGreaterThan(0);
    expect(hits.some((m) => m.message.includes(c.msg ?? "")), describeMsgs(hits)).toBe(true);
  });
});

describe("A5: costuras pasan dentro de su carpeta", () => {
  test.each(SEAM_ALLOWED.map((c) => [c.name, c] as const))("%s", async (_name, c) => {
    const msgs = await lint(c.file, c.code);
    const hits = msgs.filter((m) => m.ruleId !== null && SEAM_RULES.includes(m.ruleId));
    expect(hits, describeMsgs(hits)).toEqual([]);
  });
});
