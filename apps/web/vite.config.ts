import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const src = (dir: string): string => fileURLToPath(new URL(`./src/${dir}`, import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/\\/g, "/");

/**
 * Module → path relative to the repo, with no machine data: from `node_modules/` if it is a dependency, or from the repo
 * root if it is our own code (dist carries no absolute paths with the user name).
 */
export function relativeModuleId(id: string, root = REPO_ROOT): string {
  const clean = id.replace(/\\/g, "/").replace(/^\0/, "").replace(/\?.*$/, "");
  const nm = clean.lastIndexOf("node_modules/");
  if (nm >= 0) return clean.slice(nm);
  return clean.startsWith(root) ? clean.slice(root.length) : clean.slice(clean.lastIndexOf("/") + 1);
}

/** F2 A6: writes dist/.vite/chunk-modules.json (chunk file → modules) for check:budgets. */
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

/**
 * F4.2: the HUD talks to apps/server over the SAME origin (03 Â§7.8: connect-src only to its own API). In `vite` and in
 * `vite preview`, /scene-token and the /scene WebSocket go to the scene server on 127.0.0.1 (LG_PORT, 8787 by
 * default; D-158). With no server up, the HUD says there is no connection.
 */
const SCENE_SERVER = `http://127.0.0.1:${process.env["LG_PORT"] ?? "8787"}`;
const sceneProxy = { "/scene": { target: SCENE_SERVER, ws: true, changeOrigin: false } };

// apps/web aliases (P0 T3, 03 Â§4.2.1); mirror of "paths" in tsconfig.json.
export default defineConfig({
  server: { proxy: sceneProxy },
  preview: { proxy: sceneProxy },
  // Tailwind v4 (03 Â§2.6): tokens in src/styles/tokens.css.
  plugins: [react(), tailwindcss(), chunkModules()],
  // check:budgets reads dist/.vite/manifest.json and chunk-modules.json (03 Â§2.7.3, F1.1b, F2).
  // check:budgets sets the caps (450 KB gzip for the 3D chunk); Vite's 500 kB uncompressed warning does not apply.
  build: { manifest: true, chunkSizeWarningLimit: 1500 },
  // Open-world-3d T6: KTX2Loader is imported by a lazy chunk (world/terrain/groundMaterial.ts) that Vite's initial scan
  // does not discover; without this, the first visit with a cold cache re-optimizes and RELOADS the page midway
  // (measured: the Walk was left in the menu). Including it pre-bundles it at startup.
  optimizeDeps: { include: ["three/addons/loaders/KTX2Loader.js"] },
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
