// Composition root (03 §4.2.1, P0 T1): styles, store, services (boot/) and shell.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import { App } from "./App";
import { boot } from "./boot";
import { universeFromSearch } from "./services/content";
import { installPhotoModeToggle } from "./services/input/photoMode";
import { browserQualityEnv } from "./services/quality";
import { createWebPlatform } from "./services/platform";
import { browserSceneConnector } from "./services/scene/connector";
import { actions } from "./state/actions";
import { gameStore } from "./state/store";

// F5.2: voice by default; `?voz=0` in the URL forces text mode (diagnostics). The audio engine (single AudioContext,
// R13) is loaded deferred with the first scene: it does not enter the initial chunk.
const voiceOn = new URLSearchParams(window.location.search).get("voz") !== "0";
const audio = voiceOn
  ? { createEngine: () => import("./services/audio/engine").then((m) => m.createBrowserAudioEngine()) }
  : undefined;

// S4/D-806: `?universe=<id>` picks the universe to play (dev:play builds it with the same id as the server's LG_UNIVERSE).
// Without the param, the client plays the farmer universe (the legacy content tree), verbatim.
const universeId = universeFromSearch(window.location.search);

// Capture mode: H hides the interface (services/input/photoMode.ts).
installPhotoModeToggle(window, document.documentElement);

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
    // F4.2: the scene server through the same origin (Vite proxies to apps/server in dev and in preview).
    scene: {
      connector: browserSceneConnector({
        httpBase: window.location.origin,
        wsBase: `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`,
      }),
      ...(audio ? { audio } : {}),
    },
  });
}
