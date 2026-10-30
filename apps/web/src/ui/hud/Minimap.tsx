// Minimapa (open-world-3d T9, M4; mockup V6 "heading up, 60 m"): abajo a la derecha, siempre se ve dónde estás y
// dónde están los puntos rojos de los NPCs que faltan visitar. Arriba es adelante (el yaw de la cámara) y se ven 60 m
// a la redonda; un NPC más lejos queda como flecha roja en el anillo, apuntando hacia él.
//
// Cómo se dibuja (AC56): un efecto con un intervalo de 100 ms lee el store con `readGame(selectMinimap)` y pinta un
// canvas 2D. Nunca dentro del bucle de render de three (useFrame) ni por cuadro: a lo sumo 10 redibujos por segundo, y
// ninguno si nada cambió (jugador quieto, giro ya llegado). El canvas pinta el suelo, el agua, los caminos y la flecha
// del jugador; los puntos de los NPCs son elementos del DOM (`data-npc-id`, un anillo rojo con contorno de tinta, como
// el mockup), así su contraste y su cantidad se leen sin mirar píxeles. Una lista visualmente oculta y el nombre
// accesible de la raíz dicen a quién falta visitar y a cuántos metros está cada uno.
//
// Se ve en el mapa jugable a cualquier zoom; en la charla no se monta (el shell muestra el HUD de diálogo en lugar del
// del mapa) y en `dialog-only` tampoco (`selectMinimapVisible`). Con "reducir movimiento" el giro corta en vez de
// suavizarse (`stepMinimapYaw` del núcleo). Los colores salen del look del diorama (D-839); acá no hay un solo hex.
// Tamaño en rem (7rem en teléfono, 10rem desde md: 112 y 160 px con texto al 100 %), como el resto del HUD. El círculo
// recibe el puntero (como los controles del HUD y el mockup): un clic encima no camina hasta el suelo de abajo.
import { useEffect, useRef } from "react";
import type { MinimapModel } from "@lg/core";
import { t } from "../../i18n";
import {
  MINIMAP_REDRAW_MS, readGame, selectMinimap, selectMinimapVisible, selectPendingNpcs, useGameView, type MinimapView,
} from "../../state/selectors";

/** Lado del punto de NPC y de la flecha del borde (rem), y su contorno de tinta. */
const DOT = "1.125rem";
const ARROW = "1.375rem";
const HALO = "0.125rem";
/** Flecha del borde (mockup V6 `.npc-dot.edge`): punta arriba; se gira hacia el NPC. */
const ARROW_CLIP = "polygon(50% 0, 100% 100%, 50% 74%, 0 100%)";

export function Minimap() {
  const visible = useGameView(selectMinimapVisible);
  return visible ? <MinimapPanel /> : null;
}

function MinimapPanel() {
  const pending = useGameView(selectPendingNpcs);
  const root = useRef<HTMLElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const rings = useRef(new Map<string, HTMLSpanElement>());
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let prevYaw: number | null = null;
    let lastKey: string | null = null;
    const tick = (): void => {
      const size = wrap.current?.clientWidth ?? 0;
      const view = readGame((s) => selectMinimap(s, { sizePx: size, prevYawDeg: prevYaw, dtS: MINIMAP_REDRAW_MS / 1000 }));
      prevYaw = view.yawDeg;
      const m = view.model;
      if (!m) return;
      // El texto accesible (metros redondeados) se escribe en el DOM solo si cambió: sin re-render de React por paso.
      const text = spoken(m.markers);
      if (root.current && root.current.getAttribute("aria-label") !== text.label) {
        root.current.setAttribute("aria-label", text.label);
        list.current?.querySelectorAll("li").forEach((li, i) => { li.textContent = text.items[i] ?? ""; });
      }
      // Sin layout (lado 0: jsdom, o el HUD todavía sin medir) no hay nada que pintar.
      if (size <= 0) return;
      // Sin cambios (mismo lugar, mismos pendientes, giro llegado, mismo tamaño) no se redibuja.
      const key = `${m.sizePx}|${m.yawDeg}|${m.player.x}|${m.player.z}|${m.markers.map((k) => k.id).join(",")}`;
      if (key === lastKey) return;
      lastKey = key;
      paint(canvas.current, view);
      for (const k of m.markers) placeRing(rings.current.get(k.id), k, view);
      if (wrap.current) wrap.current.dataset.heading = String(Math.round(view.yawDeg));
    };
    tick();
    const id = setInterval(tick, MINIMAP_REDRAW_MS);
    return () => clearInterval(id);
    // Los pendientes cambian el juego de anillos: se reinicia para pintarlos en su lugar enseguida.
  }, [pending]);

  // El texto del primer render; después lo mantiene el efecto.
  const first = spoken(readGame((s) => selectMinimap(s)).model?.markers ?? []);
  return (
    <section
      ref={root}
      data-testid="minimap"
      aria-label={first.label}
      className="pointer-events-none fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))] z-10"
    >
      <div ref={wrap} data-testid="minimap-map" className="pointer-events-auto relative size-[7rem] rounded-full border-2 border-card-line shadow-card md:size-[10rem]">
        <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 h-full w-full rounded-full" />
        <div aria-hidden="true" className="absolute inset-0">
          {pending.map((n) => (
            <span
              key={n.id}
              data-npc-id={n.id}
              ref={(el) => { if (el) rings.current.set(n.id, el); else rings.current.delete(n.id); }}
              className="absolute left-0 top-0"
            />
          ))}
        </div>
      </div>
      <ul ref={list} className="sr-only">
        {pending.map((n, i) => <li key={n.id}>{first.items[i]}</li>)}
      </ul>
    </section>
  );
}

/** El nombre accesible y la lista oculta: cada pendiente con su distancia en metros, o que ya no falta nadie. */
function spoken(markers: readonly MinimapModel["markers"][number][]): { label: string; items: string[] } {
  const items = markers.map((k) => t("minimap.item", { name: k.name, count: Math.round(k.distanceM) }));
  return { label: items.length > 0 ? t("minimap.label", { list: items.join("; ") }) : t("minimap.labelDone"), items };
}

/** Un anillo de NPC en su lugar: punto rojo con contorno de tinta, o flecha roja girada hacia él si está en el borde. */
function placeRing(el: HTMLSpanElement | undefined, k: MinimapModel["markers"][number], view: MinimapView): void {
  if (!el) return;
  const c = view.colors;
  const side = k.edge ? ARROW : DOT;
  el.dataset.edge = String(k.edge);
  el.style.width = side;
  el.style.height = side;
  el.style.transform = `translate(${k.x.toFixed(1)}px, ${k.y.toFixed(1)}px) translate(-50%, -50%)${k.edge ? ` rotate(${Math.round(k.bearingDeg)}deg)` : ""}`;
  if (k.edge) {
    el.style.border = "none";
    el.style.borderRadius = "0";
    el.style.background = c.npc;
    el.style.boxShadow = "none";
    el.style.clipPath = ARROW_CLIP;
    el.style.filter = `drop-shadow(0 0 ${HALO} ${c.ring}) drop-shadow(0 0 ${HALO} ${c.ring})`;
  } else {
    el.style.border = `0.1875rem solid ${c.npc}`;
    el.style.borderRadius = "50%";
    el.style.background = "transparent";
    el.style.boxShadow = `0 0 0 ${HALO} ${c.ring}`;
    el.style.clipPath = "none";
    el.style.filter = "none";
  }
}

/** El fondo del minimapa en el canvas: suelo, agua, caminos, límites del diorama y la flecha del jugador (arriba). */
function paint(el: HTMLCanvasElement | null, view: MinimapView): void {
  const m = view.model;
  const g = el?.getContext("2d") ?? null;
  if (!el || !g || !m) return;
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  const px = Math.round(m.sizePx * dpr);
  if (el.width !== px) { el.width = px; el.height = px; }
  const c = view.colors;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, m.sizePx, m.sizePx);
  g.save();
  g.beginPath();
  g.arc(m.center, m.center, m.radiusPx, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = c.ground;
  g.fillRect(0, 0, m.sizePx, m.sizePx);
  g.fillStyle = c.water;
  for (const poly of m.ponds) {
    g.beginPath();
    poly.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
    g.closePath();
    g.fill();
  }
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const [lines, color] of [[m.rivers, c.water], [m.roads, c.road]] as const) {
    g.strokeStyle = color;
    for (const l of lines) {
      g.lineWidth = Math.max(1, l.widthPx);
      g.beginPath();
      l.points.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
      g.stroke();
    }
  }
  if (m.bounds) {
    g.globalAlpha = 0.45;
    g.strokeStyle = c.ring;
    g.lineWidth = 1.5;
    g.setLineDash([5, 4]);
    g.beginPath();
    m.bounds.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
    g.closePath();
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;
  }
  g.restore();
  // La flecha del jugador, siempre arriba (mockup V6), a escala del lado de 160.
  const u = m.sizePx / 160;
  const o = m.center;
  g.beginPath();
  g.moveTo(o, o - 10 * u);
  g.lineTo(o + 7 * u, o + 8 * u);
  g.lineTo(o, o + 4 * u);
  g.lineTo(o - 7 * u, o + 8 * u);
  g.closePath();
  g.fillStyle = c.player;
  g.fill();
  g.lineWidth = 2 * u;
  g.strokeStyle = c.ring;
  g.stroke();
}
