import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const src = (dir: string): string => fileURLToPath(new URL(`./src/${dir}`, import.meta.url));

// Alias de apps/web (P0 T3, 03 §4.2.1); espejo de "paths" en tsconfig.json.
export default defineConfig({
  // Tailwind v4 (03 §2.6): tokens en src/styles/tokens.css.
  plugins: [react(), tailwindcss()],
  // check:budgets lee dist/.vite/manifest.json (03 §2.7.3, F1.1b).
  build: { manifest: true },
  resolve: {
    alias: {
      "@ui": src("ui"),
      "@world": src("world"),
      "@state": src("state"),
      "@services": src("services"),
      "@i18n": src("i18n"),
      "@teacher": src("teacher"),
    },
  },
});
