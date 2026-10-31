// dev/portraits/ — director-mode portrait panel (plan estetica-c M3, D-030; architecture review 2026-10-12). Only boot/dev.ts loads it
// with import() under the double key and `?retratos`. It knows neither three nor world/ (ADR-026): it receives the function that
// renders a portrait. The operator presses "Renderizar", looks at each bust and downloads the PNGs to commit them in
// apps/web/public/portraits/ with their row in the registry (DEFERRED-OPERATOR; until then the portrait is the F1.3 SVG).

export interface PortraitPanelDeps {
  ids: readonly string[];
  render: (id: string) => Promise<Blob>;
  mount: HTMLElement;
  /** For tests; by default URL.createObjectURL / revokeObjectURL. */
  urls?: { create(b: Blob): string; revoke(u: string): void };
}

/** Mounts the panel. Returns what unmounts it (releases the PNG urls). */
export function startPortraitPanel(deps: PortraitPanelDeps): () => void {
  const urls = deps.urls ?? { create: (b: Blob) => URL.createObjectURL(b), revoke: (u: string) => URL.revokeObjectURL(u) };
  const doc = deps.mount.ownerDocument;
  const made: string[] = [];
  const panel = doc.createElement("section");
  // The development-only marker: check:dev-only fails if this panel ends up in a build.
  panel.setAttribute("data-lg-portraits", "__lg_director:panel-retratos");
  panel.setAttribute("aria-label", "Retratos de solo-diálogo");
  panel.style.cssText = "position:fixed;right:8px;top:8px;z-index:9999;max-height:90vh;overflow:auto;background:#fffaf0;color:#2b2622;padding:8px;border-radius:8px;font:12px sans-serif";
  const title = doc.createElement("h2");
  title.textContent = "Retratos (D-030)";
  const status = doc.createElement("p");
  status.setAttribute("role", "status");
  const list = doc.createElement("ul");
  list.style.cssText = "list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,96px);gap:6px";
  const button = doc.createElement("button");
  button.type = "button";
  button.textContent = "Renderizar";
  button.onclick = async () => {
    button.disabled = true;
    list.replaceChildren();
    for (const id of deps.ids) {
      status.textContent = `renderizando ${id}…`;
      const item = doc.createElement("li");
      try {
        const url = urls.create(await deps.render(id));
        made.push(url);
        const img = doc.createElement("img");
        img.src = url;
        img.alt = id;
        img.width = 96;
        img.height = 96;
        const link = doc.createElement("a");
        link.href = url;
        link.download = `${id}.png`;
        link.textContent = `${id}.png`;
        item.append(img, link);
      } catch (e) {
        item.textContent = `${id}: ${e instanceof Error ? e.message : String(e)}`;
      }
      list.append(item);
    }
    status.textContent = `${deps.ids.length} retrato(s); bajalos y commitealos en apps/web/public/portraits/`;
    button.disabled = false;
  };
  panel.append(title, button, status, list);
  deps.mount.append(panel);
  return () => {
    panel.remove();
    for (const u of made) urls.revoke(u);
  };
}
