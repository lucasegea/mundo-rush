// Raíz de composición (03 §4.2.1, P0 T1). Marcador de F1.1a: monta App; el shell DOM llega en F1.3.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
