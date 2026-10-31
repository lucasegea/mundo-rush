// world/labels/labelSprite.ts — the name chip as a three Sprite (architecture review 2026-10-12, §10 question 5): texture via
// CanvasTexture drawn at 2x with the system font stack (no fonts downloaded from outside nor DOM per frame),
// material of class `etiqueta` with `sizeAttenuation: false` and `depthTest: false`. Without a 2D canvas (tests), the texture
// stays blank and the rest is the same.
import { CanvasTexture, DataTexture, RGBAFormat, SRGBColorSpace, Sprite, type Texture } from "three";
import { labelMaterial } from "../materials/registry";
import { THIRD_PERSON_VIEW } from "../camera/zoom";
import { LABEL_FONT, LABEL_FONT_PX, labelLayout, labelScale, type LabelLayout } from "./labels";

type Ctx = CanvasRenderingContext2D;

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function draw(ctx: Ctx, name: string, l: LabelLayout): void {
  ctx.clearRect(0, 0, l.width, l.height);
  roundRect(ctx, 2, 2, l.width - 4, l.height - 4, (l.height - 4) / 2);
  ctx.fillStyle = l.style.fill;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = l.style.border;
  ctx.stroke();
  ctx.font = LABEL_FONT;
  ctx.textBaseline = "middle";
  if (l.key) {
    roundRect(ctx, l.key.x, l.key.y, l.key.size, l.key.size, 8);
    ctx.fillStyle = l.style.text;
    ctx.fill();
    ctx.fillStyle = l.style.fill;
    ctx.textAlign = "center";
    ctx.fillText("E", l.key.x + l.key.size / 2, l.textY + 1);
  }
  ctx.fillStyle = l.style.text;
  ctx.textAlign = "left";
  ctx.fillText(name, l.textX, l.textY + 1);
}

function canvas2d(): { canvas: HTMLCanvasElement; ctx: Ctx } | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  try {
    const ctx = canvas.getContext("2d");
    return ctx ? { canvas, ctx } : null;
  } catch {
    return null;
  }
}

/** Chip texture and its measurements. */
export function labelTexture(name: string, highlighted: boolean): { texture: Texture; layout: LabelLayout } {
  const c = canvas2d();
  if (!c) {
    const layout = labelLayout(name, highlighted, (t) => t.length * LABEL_FONT_PX * 0.56);
    const texture = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat);
    texture.needsUpdate = true;
    return { texture, layout };
  }
  c.ctx.font = LABEL_FONT;
  const layout = labelLayout(name, highlighted, (t) => c.ctx.measureText(t).width);
  c.canvas.width = layout.width;
  c.canvas.height = layout.height;
  draw(c.ctx, name, layout);
  const texture = new CanvasTexture(c.canvas);
  texture.colorSpace = SRGBColorSpace;
  return { texture, layout };
}

/** The label Sprite, anchored at the bottom center and always on top (high renderOrder). */
export function createNameLabel(name: string, highlighted: boolean): Sprite {
  const { texture, layout } = labelTexture(name, highlighted);
  const sprite = new Sprite(labelMaterial(texture));
  sprite.center.set(0.5, 0);
  // Open-world-3d T5: the chip measures the same on screen with the third-person lens (before, perspective3D's).
  const [sx, sy] = labelScale(layout, THIRD_PERSON_VIEW.fovDeg);
  sprite.scale.set(sx, sy, 1);
  sprite.renderOrder = 10;
  sprite.userData["label"] = { name, highlighted };
  return sprite;
}

export function disposeNameLabel(s: Sprite): void {
  s.material.map?.dispose();
  s.material.dispose();
}
