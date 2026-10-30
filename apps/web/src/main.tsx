// Raíz de composición (03 §4.2.1, P0 T1): estilos, store, servicios (boot/) y shell.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import { App } from "./App";
import { boot } from "./boot";
import { universeFromSearch } from "./services/content";
import { browserQualityEnv } from "./services/quality";
import { createWebPlatform } from "./services/platform";
import { browserSceneConnector } from "./services/scene/connector";
import { actions } from "./state/actions";
import { gameStore } from "./state/store";

// F5.2: voz por defecto; `?voz=0` en la URL fuerza el modo texto (diagnóstico). El motor de audio (único AudioContext,
// R13) se carga diferido con la primera escena: no entra al chunk inicial.
const voiceOn = new URLSearchParams(window.location.search).get("voz") !== "0";
const audio = voiceOn
  ? { createEngine: () => import("./services/audio/engine").then((m) => m.createBrowserAudioEngine()) }
  : undefined;

// S4/D-806: `?universe=<id>` elige el universo a jugar (dev:play lo arma con el mismo id que LG_UNIVERSE del servidor).
// Sin el param, el cliente juega la campesino (el árbol de contenido legacy), verbatim.
const universeId = universeFromSearch(window.location.search);

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  void boot({
    store: gameStore,
    actions,
    platform: createWebPlatform(),
    qualityEnv: browserQualityEnv(),
    prefersReducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    baseUrl: import.meta.env.BASE_URL,
    ...(universeId ? { universeId } : {}),
    world: { inputTarget: window },
    // F4.2: el servidor de escenas por el mismo origen (Vite hace de proxy a apps/server en dev y en preview).
    scene: {
      connector: browserSceneConnector({
        httpBase: window.location.origin,
        wsBase: `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`,
      }),
      ...(audio ? { audio } : {}),
    },
  });
}
