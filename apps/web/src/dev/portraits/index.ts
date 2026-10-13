// dev/portraits/ — panel de retratos del modo director (plan estetica-c M3, D-030; revisión de arquitectura 2026-10-12). Solo lo carga
// boot/dev.ts con import() bajo la doble llave y `?retratos`. No conoce three ni world/ (ADR-026): recibe la función que
// renderiza un retrato. El operador aprieta "Renderizar", mira cada busto y baja los PNG para commitearlos en
// apps/web/public/portraits/ con su fila en el registro (DEFERRED-OPERATOR; hasta entonces el retrato es el SVG de F1.3).

export interface PortraitPanelDeps {
  ids: readonly string[];
  render: (id: string) => Promise<Blob>;
  mount: HTMLElement;
  /** Para tests; por defecto URL.createObjectURL / revokeObjectURL. */
  urls?: { create(b: Blob): string; revoke(u: string): void };
}

/** Monta el panel. Devuelve con qué desmontarlo (libera las url de los PNG). */
export function startPortraitPanel(deps: PortraitPanelDeps): () => void {
  const urls = deps.urls ?? { create: (b: Blob) => URL.createObjectURL(b), revoke: (u: string) => URL.revokeObjectURL(u) };
  const doc = deps.mount.ownerDocument;
  const made: string[] = [];
  const panel = doc.createElement("section");
  // El marcador de solo-desarrollo: check:dev-only falla si este panel llega a un build.
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
