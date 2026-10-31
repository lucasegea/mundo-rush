import { defineProject, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineProject({
    // Plan estetica-c M2: tests read the served .glb files as data URLs (`?inline`) without node:fs. Tests only: the
    // client build does not import models (it loads them by URL from public/models).
    // Open-world-3d T6: also the ground .ktx2 files (AC42 reads their headers).
    assetsInclude: ["**/*.glb", "**/*.ktx2"],
    test: {
      name: "@lg/web",
      include: ["test/**/*.test.{ts,tsx}"],
      environment: "node",
      // The first test of each file pays the cold start of bootApp + App; with the whole suite in parallel it
      // goes past the default 5 s (like the other heavy projects, which already have 30-60 s).
      testTimeout: 30000,
    },
  }),
);
