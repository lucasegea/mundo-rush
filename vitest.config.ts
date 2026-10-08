import { defineConfig } from "vitest/config";

// Un proyecto por workspace + el test de límites (P0 §3: test.projects reemplaza a vitest.workspace.ts).
// Cada proyecto fija su include: nada fuera de estas carpetas (p. ej. _brain/) se recolecta.
const pkg = (name: string) => ({
  test: { name: `@lg/${name}`, root: `./packages/${name}`, include: ["test/**/*.test.ts"] },
});

export default defineConfig({
  test: {
    // Cobertura del núcleo base (F1.1b A3): solo con `npm run coverage:core` (`--coverage`).
    // El alcance es el de A3 (ids, Clock, Rng, EventLog); las fases siguientes lo amplían.
    // Los globs son relativos a la raíz del proyecto filtrado (packages/core), no a la del repo.
    coverage: {
      provider: "v8",
      // F1.3 suma las reglas nuevas del núcleo: tiers (R12), ajustes y fase/paneles del shell.
      include: ["src/ids.ts", "src/runtime/**/*.ts", "src/quality/**/*.ts", "src/settings/**/*.ts", "src/shell/**/*.ts",
        // F2: movimiento, entrada semántica, cámara y dioramas.
        "src/movement/**/*.ts", "src/input/**/*.ts", "src/camera/**/*.ts", "src/world/**/*.ts",
        // F4.1: máquina de escena, criterios y efectos de misión.
        "src/scene/**/*.ts"],
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage/core",
      thresholds: { lines: 90 },
    },
    projects: [
      pkg("core"),
      pkg("protocol"),
      pkg("content-schema"),
      { test: { name: "@lg/server", root: "./apps/server", include: ["test/**/*.test.ts"] } },
      "./apps/web/vitest.config.ts",
      { test: { name: "lint-boundaries", root: "./scripts/lint", include: ["**/*.test.ts"], testTimeout: 30000 } },
      { test: { name: "budgets", root: "./scripts/budgets", include: ["**/*.test.ts"] } },
      { test: { name: "adr", root: "./scripts/adr", include: ["**/*.test.ts"] } },
      // F1.2: el contenido real compila; lints, red, retirados, filtros, salida e incremental (A2-A9, A11).
      { test: { name: "content", root: "./scripts/content", include: ["**/*.test.ts"], testTimeout: 30000 } },
      // F1.3 A4: contraste de los tokens del HUD.
      { test: { name: "a11y", root: "./scripts/a11y", include: ["**/*.test.ts"] } },
      // F4.1: compuerta de la eval en vivo de texto (la eval en sí no corre en tests, D-027).
      { test: { name: "eval", root: "./scripts/eval", include: ["**/*.test.ts"] } },
      // FD0: modo director (plugin, diario, CLI, MCP y config fusionada), solo desarrollo.
      { test: { name: "director", root: "./tooling/director", include: ["test/**/*.test.ts"], testTimeout: 30000 } },
    ],
  },
});
