// Hooks de accesibilidad del shell: ajustes aplicados al documento y manejo del foco.
import { useEffect, useRef } from "react";
import { actions } from "../../state/actions";
import { selectDocumentSettings, selectFocusRequest, useGameView } from "../../state/selectors";

/** Escala del texto, alto contraste y reducir movimiento sobre <html> (un solo valor raíz, 03 §2.6). */
export function useDocumentSettings(): void {
  const view = useGameView(selectDocumentSettings);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--lg-font-scale", String(view.fontScale));
    root.dataset.contrast = view.highContrast ? "high" : "normal";
    root.dataset.reduceMotion = String(view.reduceMotion);
    root.dataset.font = view.font;
  }, [view]);
}

/** Atiende los pedidos de foco del store (al cerrar un panel el foco vuelve a quien lo abrió). */
export function useFocusRequests(): void {
  const request = useGameView(selectFocusRequest);
  useEffect(() => {
    if (request === null) return;
    document.getElementById(request)?.focus();
    actions.focusHandled();
  }, [request]);
}

/** Pone el foco en el elemento al montarse (título de un panel o vista, para que el lector lo diga). */
export function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}
