// services/input/photoMode.ts — capture mode: H hides the interface and leaves only the world and the minimap (tokens.css,
// [data-lg-photo]); H again brings it back. It is used already inside the world: hiding the entry menu would leave the game
// waiting for a click. While typing it does nothing.

/** Installs the shortcut; returns the function that removes it. */
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
