// world/labels/bubbleSprite.ts: la burbuja ámbar de pedido (propuesta C §3, plan estetica-c M5): un globo ámbar con
// tres puntos claros sobre la etiqueta de nombre del NPC que tiene un pedido abierto. Es un Sprite de la clase
// `etiqueta` (mismo material que el chip de nombre: tamaño constante en pantalla, siempre visible), así que no suma
// una clase de material nueva. Flota apenas arriba y abajo; con "reducir movimiento" queda quieta. Qué NPC la muestra
// lo decide `selectRequestBubbles` (state/selectors/world.ts), no este archivo.
import { PALETTE } from "@lg/art";
import { CanvasTexture, DataTexture, RGBAFormat, SRGBColorSpace, Sprite, type Texture } from "three";
import { PERSPECTIVE } from "../camera/rig";
import { labelMaterial } from "../materials/registry";
import { LABEL_SCREEN_FRACTION } from "./labels";

/** Medidas del globo dibujado a 2x (px del canvas): cuerpo redondeado y una colita abajo al centro. */
export const BUBBLE_LAYOUT = { width: 96, height: 72, body: 56, tail: 14, dotR: 7, dotGap: 22, border: 4 } as const;
/** Colores del globo: los mismos tokens de la etiqueta resaltada (el ámbar es "acá hay algo para vos"). */
export const BUBBLE_STYLE = { fill: PALETTE["ámbar"], border: PALETTE["ámbar-osc"], dots: PALETTE.papel } as const;
/** Alto en pantalla del globo, en altos de etiqueta. */
export const BUBBLE_LABEL_RATIO = 1.25;
/** Hueco entre la etiqueta y el globo, en altos del globo. */
const GAP = 0.25;
/** Flote: amplitud (en altos del globo) y período (s). */
export const BUBBLE_FLOAT = { amplitude: 0.12, periodS: 1.8 } as const;

/** Escala del Sprite (sin atenuación) para el fov dado: alto = BUBBLE_LABEL_RATIO alturas de etiqueta. */
export function bubbleScale(fovDeg: number): [number, number] {
  const h = 2 * LABEL_SCREEN_FRACTION * BUBBLE_LABEL_RATIO * Math.tan(((fovDeg * Math.PI) / 180) / 2);
  return [h * (BUBBLE_LAYOUT.width / BUBBLE_LAYOUT.height), h];
}

/**
 * `center.y` del Sprite en el instante `t` (s): el globo se ancla en el mismo punto que la etiqueta y se corre hacia
 * arriba en unidades del propio sprite (la etiqueta mide 1/BUBBLE_LABEL_RATIO de alto de globo). Quieto si `still`.
 */
export function bubbleCenterY(t: number, still: boolean): number {
  const base = -(1 / BUBBLE_LABEL_RATIO + GAP);
  return still ? base : base - BUBBLE_FLOAT.amplitude * Math.sin((2 * Math.PI * t) / BUBBLE_FLOAT.periodS);
}

type Ctx = CanvasRenderingContext2D;

function draw(ctx: Ctx): void {
  const { width: w, body, tail, dotR, dotGap, border } = BUBBLE_LAYOUT;
  const r = body / 2 - border;
  ctx.clearRect(0, 0, w, BUBBLE_LAYOUT.height);
  ctx.beginPath();
  ctx.moveTo(border + r, border);
  ctx.arcTo(w - border, border, w - border, body - border, r);
  ctx.arcTo(w - border, body - border, border, body - border, r);
  ctx.lineTo(w / 2 + tail * 0.7, body - border);
  ctx.lineTo(w / 2, body - border + tail);
  ctx.lineTo(w / 2 - tail * 0.7, body - border);
  ctx.arcTo(border, body - border, border, border, r);
  ctx.arcTo(border, border, w - border, border, r);
  ctx.closePath();
  ctx.fillStyle = BUBBLE_STYLE.fill;
  ctx.fill();
  ctx.lineWidth = border;
  ctx.strokeStyle = BUBBLE_STYLE.border;
  ctx.stroke();
  ctx.fillStyle = BUBBLE_STYLE.dots;
  for (const dx of [-dotGap, 0, dotGap]) {
    ctx.beginPath();
    ctx.arc(w / 2 + dx, body / 2, dotR, 0, 2 * Math.PI);
    ctx.fill();
  }
}

function bubbleTexture(): Texture {
  let ctx: Ctx | null = null;
  let canvas: HTMLCanvasElement | null = null;
  if (typeof document !== "undefined") {
    canvas = document.createElement("canvas");
    try {
      ctx = canvas.getContext("2d");
    } catch {
      ctx = null;
    }
  }
  if (!ctx || !canvas) {
    const t = new DataTexture(new Uint8Array([242, 169, 59, 255]), 1, 1, RGBAFormat);
    t.needsUpdate = true;
    return t;
  }
  canvas.width = BUBBLE_LAYOUT.width;
  canvas.height = BUBBLE_LAYOUT.height;
  draw(ctx);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** El Sprite del globo, anclado en el punto de la etiqueta y corrido hacia arriba; encima de la etiqueta. */
export function createRequestBubble(): Sprite {
  const sprite = new Sprite(labelMaterial(bubbleTexture()));
  sprite.center.set(0.5, bubbleCenterY(0, true));
  const [sx, sy] = bubbleScale(PERSPECTIVE.fovDeg);
  sprite.scale.set(sx, sy, 1);
  sprite.renderOrder = 11;
  sprite.userData["requestBubble"] = true;
  return sprite;
}

export function disposeRequestBubble(s: Sprite): void {
  s.material.map?.dispose();
  s.material.dispose();
}
