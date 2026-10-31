// services/input/photoMode.ts — modo captura: H oculta la interfaz y deja solo el mundo y el minimapa (tokens.css,
// [data-lg-photo]); H otra vez la devuelve. Se usa ya dentro del mundo: ocultar el menú de entrada dejaría el juego
// esperando un clic. Mientras se escribe no hace nada.

/** Instala el atajo; devuelve la función que lo saca. */
export function installPhotoModeToggle(target: Window, root: HTMLElement): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.code !== "KeyH" || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
    if (root.dataset["lgPhoto"]) delete root.dataset["lgPhoto"];
    else root.dataset["lgPhoto"] = "1";
  };
  target.addEventListener("keydown", onKey);
  return () => target.removeEventListener("keydown", onKey);
}
