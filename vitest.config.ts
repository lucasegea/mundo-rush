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
      include: ["src/ids.ts", "src/runtime/**/*.ts"],
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
    ],
  },
});
