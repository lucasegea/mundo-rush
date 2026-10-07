// Config de Vite del modo director (03 §6.5.1 punto 2): el ÚNICO lugar donde se registra el plugin. Toma la config
// de apps/web tal cual y le suma el plugin; `npm run dev` y `vite build` siguen usando apps/web/vite.config.ts, que
// no sabe que esto existe. `npm run dev:director` = `vite --config tooling/director/vite.config.ts`.
import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import baseConfig from "../../apps/web/vite.config.ts";
import { directorPlugin } from "./src/plugin.ts";

// La segunda llave del cliente (VITE_LG_DIRECTOR=1) sin depender de cross-env: Vite lee las variables VITE_* de
// process.env al resolver la config, después de evaluar este archivo. La primera llave (DEV) la pone `vite` (serve).
process.env["VITE_LG_DIRECTOR"] = "1";

export default mergeConfig(baseConfig, {
  root: fileURLToPath(new URL("../../apps/web/", import.meta.url)),
  // Solo local (D-158): el plugin se niega a activarse con otro host.
  server: { host: "127.0.0.1", watch: { ignored: ["**/public/content/**", "**/.director/**"] } },
  plugins: [directorPlugin()],
});
