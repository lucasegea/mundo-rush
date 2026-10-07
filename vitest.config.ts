import { defineConfig } from "vitest/config";

// Un proyecto por workspace + el test de límites (P0 §3: test.projects reemplaza a vitest.workspace.ts).
// Cada proyecto fija su include: nada fuera de estas carpetas (p. ej. _brain/) se recolecta.
const pkg = (name: string) => ({
  test: { name: `@lg/${name}`, root: `./packages/${name}`, include: ["test/**/*.test.ts"] },
});

export default defineConfig({
  test: {
    projects: [
      pkg("core"),
      pkg("protocol"),
      pkg("content-schema"),
      { test: { name: "@lg/server", root: "./apps/server", include: ["test/**/*.test.ts"] } },
      "./apps/web/vitest.config.ts",
      { test: { name: "lint-boundaries", root: "./scripts/lint", include: ["**/*.test.ts"], testTimeout: 30000 } },
    ],
  },
});
