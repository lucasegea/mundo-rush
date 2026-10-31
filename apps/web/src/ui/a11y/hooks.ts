// Accessibility hooks for the shell: settings applied to the document and focus handling.
import { useEffect, useRef } from "react";
import { actions } from "../../state/actions";
import { selectDocumentSettings, selectFocusRequest, useGameView } from "../../state/selectors";

/** Text scale, high contrast and reduced motion on <html> (a single root value, 03 §2.6). */
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

/** Handles the store's focus requests (when a panel closes, focus returns to whatever opened it). */
export function useFocusRequests(): void {
  const request = useGameView(selectFocusRequest);
  useEffect(() => {
    if (request === null) return;
    document.getElementById(request)?.focus();
    actions.focusHandled();
  }, [request]);
}

/** Focuses the element on mount (title of a panel or view, so the screen reader announces it). */
export function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}
