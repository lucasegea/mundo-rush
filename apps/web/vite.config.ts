import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const src = (dir: string): string => fileURLToPath(new URL(`./src/${dir}`, import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/\\/g, "/");

/**
 * Módulo → ruta relativa y sin datos de la máquina: desde `node_modules/` si es una dependencia, o desde la raíz del
 * repo si es código propio (el dist no lleva rutas absolutas con el usuario).
 */
export function relativeModuleId(id: string, root = REPO_ROOT): string {
  const clean = id.replace(/\\/g, "/").replace(/^\0/, "").replace(/\?.*$/, "");
  const nm = clean.lastIndexOf("node_modules/");
  if (nm >= 0) return clean.slice(nm);
  return clean.startsWith(root) ? clean.slice(root.length) : clean.slice(clean.lastIndexOf("/") + 1);
}

/** F2 A6: escribe dist/.vite/chunk-modules.json (archivo de chunk → módulos) para check:budgets. */
function chunkModules(): Plugin {
  return {
    name: "lg-chunk-modules",
    apply: "build",
    generateBundle(_options, bundle) {
      const out: Record<string, string[]> = {};
      for (const [file, item] of Object.entries(bundle)) {
        if (item.type === "chunk") out[file] = item.moduleIds.map((id) => relativeModuleId(id)).sort();
      }
      this.emitFile({ type: "asset", fileName: ".vite/chunk-modules.json", source: `${JSON.stringify(out, null, 2)}\n` });
    },
  };
}

// Alias de apps/web (P0 T3, 03 §4.2.1); espejo de "paths" en tsconfig.json.
export default defineConfig({
  // Tailwind v4 (03 §2.6): tokens en src/styles/tokens.css.
  plugins: [react(), tailwindcss(), chunkModules()],
  // check:budgets lee dist/.vite/manifest.json y chunk-modules.json (03 §2.7.3, F1.1b, F2).
  // Los topes los fija check:budgets (450 KB gzip para el chunk 3D); el aviso de 500 kB sin comprimir de Vite no aplica.
  build: { manifest: true, chunkSizeWarningLimit: 1500 },
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
