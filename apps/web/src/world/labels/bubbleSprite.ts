// world/labels/bubbleSprite.ts: the amber request bubble (proposal C §3, plan estetica-c M5): an amber balloon with
// three light dots above the name label of the NPC that has an open request. It is a Sprite of class
// `etiqueta` (same material as the name chip: constant screen size, always visible), so it adds no
// new material class. It floats slightly up and down; with "reduce motion" it stays still. Which NPC shows it
// is decided by `selectRequestBubbles` (state/selectors/world.ts), not this file.
import { PALETTE } from "@lg/art";
import { CanvasTexture, DataTexture, RGBAFormat, SRGBColorSpace, Sprite, type Texture } from "three";
import { PERSPECTIVE } from "../camera/rig";
import { labelMaterial } from "../materials/registry";
import { LABEL_SCREEN_FRACTION } from "./labels";

/** Balloon measurements drawn at 2x (canvas px): rounded body and a little tail at the bottom center. */
export const BUBBLE_LAYOUT = { width: 96, height: 72, body: 56, tail: 14, dotR: 7, dotGap: 22, border: 4 } as const;
/** Balloon colors: the same tokens as the highlighted label (amber is "there is something here for you"). */
export const BUBBLE_STYLE = { fill: PALETTE["ámbar"], border: PALETTE["ámbar-osc"], dots: PALETTE.papel } as const;
/** Balloon screen height, in label heights. */
export const BUBBLE_LABEL_RATIO = 1.25;
/** Gap between the label and the balloon, in balloon heights. */
const GAP = 0.25;
/** Float: amplitude (in balloon heights) and period (s). */
export const BUBBLE_FLOAT = { amplitude: 0.12, periodS: 1.8 } as const;

/** Sprite scale (no attenuation) for the given fov: height = BUBBLE_LABEL_RATIO label heights. */
export function bubbleScale(fovDeg: number): [number, number] {
  const h = 2 * LABEL_SCREEN_FRACTION * BUBBLE_LABEL_RATIO * Math.tan(((fovDeg * Math.PI) / 180) / 2);
  return [h * (BUBBLE_LAYOUT.width / BUBBLE_LAYOUT.height), h];
}

/**
 * Sprite `center.y` at instant `t` (s): the balloon is anchored at the same point as the label and shifted
 * up in the sprite's own units (the label is 1/BUBBLE_LABEL_RATIO of a balloon tall). Still if `still`.
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

/** The balloon Sprite, anchored at the label's point and shifted up; above the label. */
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
