// eslint.config.js — module boundaries (§4.3), seams R10-R15 (§3.1) and director mode (§6.5)
import tseslint from "typescript-eslint";
import importX from "eslint-plugin-import-x";

const WEB = "apps/web/src";
const p = (dir) => `./${WEB}/${dir}`;

// ---------- reusable pieces ----------
const DEVICE_EVENTS = "/^(key|pointer|mouse|touch|wheel|gamepad|click|dblclick|contextmenu)/";
const r10 = [
  { selector: `CallExpression[callee.property.name='addEventListener'][arguments.0.type='Literal'][arguments.0.value=${DEVICE_EVENTS}]`,
    message: "R10: los listeners de dispositivo viven solo en services/input/." },
  { selector: "CallExpression[callee.property.name='addEventListener'][arguments.0.type!='Literal']",
    message: "R10: nombre de evento no literal fuera de services/input/." },
];
const r11 = [
  { selector: "NewExpression[callee.name=/Camera$/]", message: "R11: cámaras solo en world/camera/." },
  { selector: "NewExpression[callee.property.name=/Camera$/]", message: "R11: cámaras solo en world/camera/." },
  { selector: "JSXOpeningElement[name.name=/^(perspective|orthographic)Camera$/]", message: "R11: cámaras solo en world/camera/." },
  { selector: "JSXOpeningElement[name.name='Canvas'] > JSXAttribute[name.name=/^(camera|orthographic)$/]",
    message: "R11: la cámara la fija CameraRig (makeDefault), no <Canvas>." },
];
const r13 = [
  { selector: "NewExpression[callee.name=/^(AudioContext|webkitAudioContext|OfflineAudioContext|Audio)$/]",
    message: "R13: un solo AudioContext, en services/audio/." },
  { selector: "NewExpression[callee.property.name=/^(AudioContext|webkitAudioContext|OfflineAudioContext|Audio)$/]",
    message: "R13: un solo AudioContext, en services/audio/." },
];
// D-207 / plan estetica-c M1 A16: world/ imports three by name (`import { MeshToonMaterial } from "three"`), never the whole
// namespace (outside world/camera/). Stricter than R11; it goes in the SAME list as world/'s R10, R11 and R13
// because in flat config a later block with no-restricted-syntax replaces the previous one's options.
const threeNamespace = [
  { selector: "ImportDeclaration[source.value=/^three($|[^a-z0-9-])/] > ImportNamespaceSpecifier",
    message: "D-207: world/ importa three por nombre (import { X } from \"three\"), no import * as THREE." },
];
const r15Props = [
  { object: "navigator", property: "xr", message: "R15: navigator.xr solo en services/platform/." },
  { object: "navigator", property: "getGamepads", message: "R10: gamepad solo en services/input/." },
];
const cameraImports = [
  { name: "three", importNames: ["PerspectiveCamera", "OrthographicCamera", "CubeCamera", "StereoCamera", "ArrayCamera"],
    message: "R11: cámaras solo en world/camera/." },
  { name: "@react-three/drei", importNames: ["PerspectiveCamera", "OrthographicCamera", "CubeCamera", "OrbitControls", "MapControls", "CameraControls"],
    message: "R11: cámaras y controles solo en world/camera/." },
];
const platformImports = { group: ["@tauri-apps/*", "@capacitor/*"], message: "R15: solo en services/platform/." };
// F4.1: server disk writes (fs.write*, createWriteStream, appendFile*). Bare `write`/`writeSync` stay
// out of the call selector so as not to confuse them with streams and sockets; as an fs import they are blocked.
const FS_MODULES = ["fs", "node:fs", "fs/promises", "node:fs/promises"];
const FS_RE = "/^(node:)?fs(\\u002Fpromises)?$/";
const DISK_WRITE_FNS = ["writeFile", "writeFileSync", "appendFile", "appendFileSync", "createWriteStream", "writev", "writevSync"];
const DISK_WRITE_IMPORTS = [...DISK_WRITE_FNS, "write", "writeSync"];
const DISK_WRITE_MSG = "D-108: apps/server escribe a disco solo en src/store/ y src/cost/.";

export default tseslint.config(
  // Recorded change (open-world-3d T2(d), D-830): `tooling/vendor/**` is third-party code copied byte for byte
  // (content/code-registry.yaml, with its .patch if edited), not repo code; the rest of tooling is still
  // linted (scripts/lint/vendor-ignore.test.ts proves it with a --stdin probe).
  { ignores: ["**/dist/**", "**/node_modules/**", "experiments/**", "tooling/eslint-fixtures/**", "tooling/vendor/**",
              "apps/web/public/**", "apps/server/generated/**", ".director/**"] },
  ...tseslint.configs.strict,

  // ---------- 1. Boundaries between folders (resolved paths) ----------
  {
    files: ["apps/**/*.{ts,tsx}", "packages/**/*.ts", "scripts/**/*.ts", "tooling/**/*.ts"],
    plugins: { "import-x": importX },
    settings: { "import-x/resolver": { typescript: { project: ["tsconfig.base.json", "apps/*/tsconfig.json", "packages/*/tsconfig.json", "tooling/*/tsconfig.json"] } } },
    rules: {
      "import-x/no-restricted-paths": ["error", { zones: [
        // R2/R3: ui and world never import each other
        { target: p("ui"),    from: p("world"),    message: "R3: ui/ no importa world/; pasá por el store." },
        { target: p("world"), from: p("ui"),       message: "R3: world/ no importa ui/; pasá por el store." },
        // ui and world do not import services (they are activated by state)
        { target: p("ui"),    from: p("services"), message: "§4.3: ui/ no importa services/." },
        { target: p("world"), from: p("services"), message: "§4.3: world/ no importa services/." },
        // R14 + the world gate: ui reads selectors and actions; world only selectors and bridge
        { target: p("ui"),    from: p("state"), except: ["./selectors", "./actions.ts"],
          message: "R14: ui/ solo usa state/selectors/ y state/actions.ts." },
        { target: p("world"), from: p("state"), except: ["./selectors", "./bridge.ts"],
          message: "§4.3: world/ solo usa state/selectors/ y state/bridge.ts." },
        // state is the base: it knows no one above
        { target: p("state"), from: [p("ui"), p("world"), p("services")], message: "§4.3: state/ no importa capas superiores." },
        // services does not know views
        { target: p("services"), from: [p("ui"), p("world")], message: "§4.3: services/ no importa ui/ ni world/." },
        // teacher panel
        { target: p("teacher"), from: [p("world"), p("services"), p("state")], message: "§4.3: teacher/ habla solo con la API." },
        { target: p("teacher"), from: p("ui"), except: ["./primitives"], message: "§4.3: teacher/ solo usa ui/primitives." },
        // director mode (development only, ADR-026): no one in the game imports it; it reads selectors and dispatches actions
        { target: [p("ui"), p("world"), p("state"), p("services"), p("teacher")], from: p("dev"),
          message: "ADR-026: el juego no importa dev/ (modo director)." },
        { target: p("dev"), from: p("state"), except: ["./selectors", "./actions.ts"],
          message: "ADR-026: dev/ solo usa state/selectors/ y state/actions.ts." },
        { target: p("dev"), from: [p("world"), p("services")], message: "ADR-026: dev/ no importa world/ ni services/." },
        { target: p("dev"), from: p("ui"), except: ["./primitives"], message: "ADR-026: dev/ solo usa ui/primitives." },
        { target: ["./apps", "./packages", "./scripts"], from: "./tooling", message: "ADR-026: el producto no importa tooling/." },
        // apps and packages
        { target: "./apps/server", from: "./apps/web", message: "§4.3: server no importa web." },
        { target: "./apps/web",    from: "./apps/server", message: "§4.3: web no importa server." },
        { target: "./packages",    from: "./apps", message: "§4.3: los paquetes no importan apps/." },
        { target: "./packages/protocol", from: ["./packages/core", "./packages/content-schema"], message: "§4.3: protocol solo depende de zod." },
        { target: "./packages/core", from: "./packages/content-schema", message: "§4.3: core no depende de content-schema." },
        // plan estetica-c M2 (architecture review 2026-10-12 §10.3): @lg/art is pure art data and depends on no other package; the
        // assets script paints with @lg/art, never with the client tree (a single implementation, no copy).
        { target: "./packages/art", from: ["./packages/core", "./packages/content-schema", "./packages/protocol"],
          message: "M2: @lg/art no depende de otros paquetes." },
        { target: "./scripts/assets", from: "./apps", message: "M2: scripts/assets/ usa @lg/art, no importa apps/." },
      ]}],
    },
  },

  // ---------- 2. Pure core (R4) ----------
  {
    files: ["packages/core/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [
        { group: ["react", "react-*", "three", "three/*", "@react-three/*", "zustand", "zustand/*", "node:*"],
          message: "R4: el núcleo es TS puro." } ] }],
      "no-restricted-globals": ["error", "window", "document", "navigator", "localStorage", "sessionStorage",
        "indexedDB", "fetch", "WebSocket", "AudioContext", "performance", "crypto", "process", "Buffer",
        "require", "__dirname", "setTimeout", "setInterval", "queueMicrotask"],
      "no-restricted-properties": ["error",
        { object: "Date", property: "now", message: "R4: inyectá el Clock." },
        { object: "Math", property: "random", message: "R4: inyectá el Rng." }],
      "no-restricted-syntax": ["error",
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: "R4: inyectá el Clock." }],
    },
  },
  // @lg/art (plan estetica-c M2, architecture review 2026-10-12 §10.3): palette, paint and bevel rule in pure TS, like R4: no
  // three, react, Node or DOM globals, and deterministic (code-made art comes from a seed).
  {
    files: ["packages/art/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [
        { group: ["react", "react-*", "three", "three/*", "@react-three/*", "zustand", "zustand/*", "node:*", "@lg/*", "@gltf-transform/*"],
          message: "M2: @lg/art es TS puro (sin three, react, Node ni otros paquetes)." } ] }],
      "no-restricted-globals": ["error", "window", "document", "navigator", "localStorage", "sessionStorage",
        "indexedDB", "fetch", "WebSocket", "AudioContext", "Image", "ImageData", "OffscreenCanvas", "HTMLCanvasElement",
        "performance", "crypto", "process", "Buffer", "require", "__dirname"],
      "no-restricted-properties": ["error",
        { object: "Date", property: "now", message: "M2: @lg/art es determinístico." },
        { object: "Math", property: "random", message: "M2: @lg/art es determinístico (usá una semilla)." }],
    },
  },
  // protocol: zod only
  { files: ["packages/protocol/**/*.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: [{ group: ["react", "react-*", "three", "three/*", "@react-three/*", "zustand", "yaml", "@lg/*"],
      message: "§4.3: protocol solo importa zod." }] }] } },
  // content-schema: zod, yaml, @lg/core
  { files: ["packages/content-schema/**/*.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: [{ group: ["react", "three", "@react-three/*", "zustand"], message: "§4.3" }] }] } },

  // ---------- 3. ui/, world/, teacher/ and dev/: core as types only; no three where it does not belong ----------
  {
    files: [`${WEB}/ui/**/*.{ts,tsx}`],
    rules: { "@typescript-eslint/no-restricted-imports": ["error", {
      paths: [{ name: "@lg/core", allowTypeImports: true, message: "ui/ usa el núcleo solo como tipos; la lógica entra por acciones." }],
      patterns: [{ group: ["three", "three/*", "@react-three/*"], message: "§4.3: ui/ no importa three." }, platformImports],
    }]},
  },
  {
    files: [`${WEB}/world/**/*.{ts,tsx}`],
    rules: { "@typescript-eslint/no-restricted-imports": ["error", {
      paths: [{ name: "@lg/core", allowTypeImports: true, message: "world/ usa el núcleo solo como tipos." }],
      patterns: [platformImports],
    }]},
  },
  { files: [`${WEB}/teacher/**/*.{ts,tsx}`],   // typescript-eslint rule: block 4 does not override it
    rules: { "@typescript-eslint/no-restricted-imports": ["error", { patterns: [{ group: ["three", "three/*", "@react-three/*"], message: "§4.3: teacher/ sin three." }] }] } },
  { files: [`${WEB}/dev/**/*.{ts,tsx}`],
    rules: { "@typescript-eslint/no-restricted-imports": ["error", { patterns: [{ group: ["three", "three/*", "@react-three/*", "@anthropic-ai/*", "@modelcontextprotocol/*"],
      message: "ADR-026: dev/ sin three ni SDKs (el copiloto y el MCP viven en tooling/)." }] }] } },

  // ---------- 4. Seams R10, R11, R13, R15 across all of apps/web ----------
  {
    files: [`${WEB}/**/*.{ts,tsx}`],
    ignores: [`${WEB}/services/input/**`, `${WEB}/world/camera/**`, `${WEB}/services/audio/**`, `${WEB}/services/platform/**`],
    rules: {
      "no-restricted-syntax": ["error", ...r10, ...r11, ...r13],
      "no-restricted-properties": ["error", ...r15Props],
      "no-restricted-imports": ["error", { paths: cameraImports, patterns: [platformImports] }],
    },
  },
  // world/ (except world/camera/): the usual seams plus three by name (D-207). Same list, nothing is lost.
  { files: [`${WEB}/world/**/*.{ts,tsx}`], ignores: [`${WEB}/world/camera/**`],
    rules: { "no-restricted-syntax": ["error", ...r10, ...r11, ...r13, ...threeNamespace] } },
  // Inside each seam folder ONLY its own rule is relaxed (the others stay):
  { files: [`${WEB}/services/input/**`],    rules: { "no-restricted-syntax": ["error", ...r11, ...r13],
      "no-restricted-properties": ["error", r15Props[0]], "no-restricted-imports": ["error", { paths: cameraImports, patterns: [platformImports] }] } },
  { files: [`${WEB}/world/camera/**`],      rules: { "no-restricted-syntax": ["error", ...r10, ...r13],
      "no-restricted-properties": ["error", ...r15Props], "no-restricted-imports": ["error", { patterns: [platformImports] }] } },
  { files: [`${WEB}/services/audio/**`],    rules: { "no-restricted-syntax": ["error", ...r10, ...r11],
      "no-restricted-properties": ["error", ...r15Props], "no-restricted-imports": ["error", { paths: cameraImports, patterns: [platformImports] }] } },
  { files: [`${WEB}/services/platform/**`], rules: { "no-restricted-syntax": ["error", ...r10, ...r11, ...r13],
      "no-restricted-properties": ["error", r15Props[1]], "no-restricted-imports": ["error", { paths: cameraImports }] } },

  // ---------- 5. Effects only in services/ (R5) ----------
  { files: [`${WEB}/{ui,world,state}/**/*.{ts,tsx}`],
    rules: { "no-restricted-globals": ["error", "fetch", "WebSocket", "indexedDB", "localStorage", "sessionStorage"] } },

  // ---------- 6. apps/server writes to disk only in src/store/ and src/cost/ (F4.1, D-108, D-157) ----------
  {
    files: ["apps/server/src/**/*.ts"],
    ignores: ["apps/server/src/store/**", "apps/server/src/cost/**"],
    rules: {
      "no-restricted-imports": ["error", { paths: FS_MODULES.map((name) => ({ name, importNames: DISK_WRITE_IMPORTS, message: DISK_WRITE_MSG })) }],
      "no-restricted-syntax": ["error",
        { selector: `ImportDeclaration[source.value=${FS_RE}] > :matches(ImportNamespaceSpecifier, ImportDefaultSpecifier)`,
          message: `${DISK_WRITE_MSG} Importá de fs solo nombres de lectura.` },
        { selector: `ImportExpression[source.value=${FS_RE}]`, message: DISK_WRITE_MSG },
        { selector: `CallExpression[callee.property.name=/^(${DISK_WRITE_FNS.join("|")})$/]`, message: DISK_WRITE_MSG }],
    },
  },
);
