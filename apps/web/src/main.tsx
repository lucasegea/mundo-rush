// Raíz de composición (03 §4.2.1, P0 T1): estilos, store, servicios (boot/) y shell.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import { App } from "./App";
import { boot } from "./boot";
import { browserQualityEnv } from "./services/quality";
import { createWebPlatform } from "./services/platform";
import { actions } from "./state/actions";
import { gameStore } from "./state/store";

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
    world: { inputTarget: window },
  });
}
