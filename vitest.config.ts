import { defineConfig } from "vitest/config";

// One project per workspace + the boundaries test (P0 §3: test.projects replaces vitest.workspace.ts).
// Each project sets its include: nothing outside these folders (e.g. _brain/) is collected.
const pkg = (name: string) => ({
  test: { name: `@lg/${name}`, root: `./packages/${name}`, include: ["test/**/*.test.ts"] },
});

export default defineConfig({
  test: {
    // Coverage of the base core (F1.1b A3): only with `npm run coverage:core` (`--coverage`).
    // The scope is A3's (ids, Clock, Rng, EventLog); later phases extend it.
    // The globs are relative to the filtered project's root (packages/core), not the repo's.
    coverage: {
      provider: "v8",
      // F1.3 adds the core's new rules: tiers (R12), settings and shell phase/panels.
      include: ["src/ids.ts", "src/runtime/**/*.ts", "src/quality/**/*.ts", "src/settings/**/*.ts", "src/shell/**/*.ts",
        // F2: movement, semantic input, camera and dioramas.
        "src/movement/**/*.ts", "src/input/**/*.ts", "src/camera/**/*.ts", "src/world/**/*.ts",
        // F4.1: scene machine, criteria and mission effects.
        "src/scene/**/*.ts",
        // F4.2: dialogue HUD rules (per-build glossary, tappable words).
        "src/dialogue/**/*.ts",
        // A2: conversation meters (ADR-027).
        "src/conversation/**/*.ts"],
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage/core",
      thresholds: { lines: 90 },
    },
    projects: [
      pkg("core"),
      pkg("protocol"),
      pkg("content-schema"),
      // Plan estetica-c M2: pure palette, paint and bevel rule (@lg/art).
      pkg("art"),
      { test: { name: "@lg/server", root: "./apps/server", include: ["test/**/*.test.ts"], testTimeout: 30000 } },
      "./apps/web/vitest.config.ts",
      { test: { name: "lint-boundaries", root: "./scripts/lint", include: ["**/*.test.ts"], testTimeout: 30000 } },
      { test: { name: "budgets", root: "./scripts/budgets", include: ["**/*.test.ts"] } },
      { test: { name: "adr", root: "./scripts/adr", include: ["**/*.test.ts"] } },
      // F1.2: the real content compiles; lints, network, retired, filters, output and incremental (A2-A9, A11).
      { test: { name: "content", root: "./scripts/content", include: ["**/*.test.ts"], testTimeout: 30000 } },
      // Plan estetica-c M2: 3D asset pipeline (optimize, license registry, download budgets).
      { test: { name: "assets", root: "./scripts/assets", include: ["**/*.test.ts"], testTimeout: 60000 } },
      // F1.3 A4: contrast of the HUD tokens.
      { test: { name: "a11y", root: "./scripts/a11y", include: ["**/*.test.ts"] } },
      // M6.4: the pure parts of the on-demand browser walk (D-815).
      { test: { name: "dev", root: "./scripts/dev", include: ["**/*.test.ts"] } },
      // F4.1: live text eval gate (the eval itself does not run in tests, D-027).
      { test: { name: "eval", root: "./scripts/eval", include: ["**/*.test.ts"] } },
      // F4.2 A4: the real web client against the real scene server, without canvas and with scripted models.
      { test: { name: "integration", root: "./scripts/integration", include: ["**/*.test.ts"], testTimeout: 60000 } },
      // FD0: director mode (plugin, journal, CLI, MCP and merged config), development only.
      { test: { name: "director", root: "./tooling/director", include: ["test/**/*.test.ts"], testTimeout: 30000 } },
      // book-mode slice-1 (M2): book → universe analyzer; EMIT writes valid YAML at canonical subpaths.
      { test: { name: "book-analyzer", root: "./tooling/book-analyzer", include: ["test/**/*.test.ts"], testTimeout: 30000 } },
    ],
  },
});
