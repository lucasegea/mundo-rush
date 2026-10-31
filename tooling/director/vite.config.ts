// Vite config of director mode (03 §6.5.1 point 2): the ONLY place where the plugin is registered. It takes apps/web's
// config as is and adds the plugin; `npm run dev` and `vite build` keep using apps/web/vite.config.ts, which
// does not know this exists. `npm run dev:director` = `vite --config tooling/director/vite.config.ts`.
import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import baseConfig from "../../apps/web/vite.config.ts";
import { directorPlugin } from "./src/plugin.ts";

// The client's second key (VITE_LG_DIRECTOR=1) without depending on cross-env: Vite reads the VITE_* variables from
// process.env when resolving the config, after evaluating this file. The first key (DEV) is set by `vite` (serve).
process.env["VITE_LG_DIRECTOR"] = "1";

export default mergeConfig(baseConfig, {
  root: fileURLToPath(new URL("../../apps/web/", import.meta.url)),
  // Local only (D-158): the plugin refuses to activate with another host.
  server: { host: "127.0.0.1", watch: { ignored: ["**/public/content/**", "**/.director/**"] } },
  // F4.1 (A8): the plugin also starts apps/server with LG_DEV_CONTENT_WATCH=1 for the scenes.
  plugins: [directorPlugin({ scenesServer: true })],
});
