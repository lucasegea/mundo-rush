import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Standalone spike (D-133): own config, nothing shared with the monorepo root.
// base "./" so dist/ can be served from any folder or sub-path.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 2000 },
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
