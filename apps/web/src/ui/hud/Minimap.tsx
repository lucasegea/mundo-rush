// Minimap (open-world-3d T9, M4; mockup V6 "heading up, 60 m"): bottom right, you can always see where you are and
// where the red dots of the NPCs still to visit are. Up is forward (the camera yaw) and 60 m are visible
// all around; an NPC farther away stays as a red arrow on the ring, pointing toward it.
//
// How it is drawn (AC56): an effect with a 100 ms interval reads the store with `readGame(selectMinimap)` and paints a
// 2D canvas. Never inside three's render loop (useFrame) nor per frame: at most 10 redraws per second, and
// none if nothing changed (player still, turn already reached). The canvas paints the ground, water, paths and the
// player's arrow; the NPC dots are DOM elements (`data-npc-id`, a red ring with an ink outline, like
// the mockup), so their contrast and count can be read without looking at pixels. A visually hidden list and the root's
// accessible name say who is left to visit and how many meters away each one is.
//
// Visible on the playable map at any zoom; it is not mounted in conversation (the shell shows the dialogue HUD instead of the
// map one) nor in `dialog-only` (`selectMinimapVisible`). With "reduce motion" the turn cuts instead of
// smoothing (`stepMinimapYaw` from the core). Colors come from the diorama look (D-839); there is not a single hex here.
// Size in rem (7rem on phone, 10rem from md: 112 and 160 px with text at 100 %), like the rest of the HUD. The circle
// receives the pointer (like the HUD controls and the mockup): a click on it does not walk to the ground below.
import { useEffect, useRef } from "react";
import type { MinimapModel } from "@lg/core";
import { t } from "../../i18n";
import {
  MINIMAP_REDRAW_MS, readGame, selectMinimap, selectMinimapVisible, selectPendingNpcs, useGameView, type MinimapView,
} from "../../state/selectors";
import { MINIMAP_OFFSET, MINIMAP_SIZE } from "./layout";

/** Side of the NPC dot and the edge arrow (rem), and its ink outline. */
const DOT = "1.125rem";
const ARROW = "1.375rem";
const HALO = "0.125rem";
/** Edge arrow (mockup V6 `.npc-dot.edge`): tip up; it is rotated toward the NPC. */
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
      // The accessible text (rounded meters) is written to the DOM only if it changed: no React re-render per step.
      const text = spoken(m.markers);
      if (root.current && root.current.getAttribute("aria-label") !== text.label) {
        root.current.setAttribute("aria-label", text.label);
        list.current?.querySelectorAll("li").forEach((li, i) => { li.textContent = text.items[i] ?? ""; });
      }
      // Without layout (side 0: jsdom, or the HUD not yet measured) there is nothing to paint.
      if (size <= 0) return;
      // Without changes (same place, same pending, turn reached, same size) it is not redrawn.
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
    // Pending ones change the set of rings: it resets so they are painted in place right away.
  }, [pending]);

  // The first render's text; afterwards the effect maintains it.
  const first = spoken(readGame((s) => selectMinimap(s)).model?.markers ?? []);
  return (
    <section
      ref={root}
      data-testid="minimap"
      aria-label={first.label}
      className={`pointer-events-none fixed ${MINIMAP_OFFSET} z-10`}
    >
      <div ref={wrap} data-testid="minimap-map" className={`pointer-events-auto relative ${MINIMAP_SIZE} rounded-full border-2 border-card-line shadow-card`}>
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

/** The accessible name and the hidden list: each pending one with its distance in meters, or that nobody is left. */
function spoken(markers: readonly MinimapModel["markers"][number][]): { label: string; items: string[] } {
  const items = markers.map((k) => t("minimap.item", { name: k.name, count: Math.round(k.distanceM) }));
  return { label: items.length > 0 ? t("minimap.label", { list: items.join("; ") }) : t("minimap.labelDone"), items };
}

/** An NPC ring in place: red dot with ink outline, or red arrow turned toward it if it is on the edge. */
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

/** The minimap background on the canvas: ground, water, paths, diorama limits and the player's arrow (up). */
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
  // The player's arrow, always up (mockup V6), scaled to the 160 side.
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
