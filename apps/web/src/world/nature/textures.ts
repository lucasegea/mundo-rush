// world/nature/textures.ts — the flower atlas (open-world-3d T7), drawn in code as in the V6 mockup (`world.js`
// flowerAtlas): four 64 px cells (daisy, buttercup, lilac, poppy), seven flowers each with stem and leaf.
// Own art: there is no third-party art. Without `document` (Node tests) it is a transparent 1 × 1.
import { CanvasTexture, DataTexture, RGBAFormat, SRGBColorSpace, type Texture } from "three";
// Open-world-3d T7b (D-839): the colors are the look ones (`WorldLook.vegetation.colors`).
import { mulberry32, RUNTIME_TEXTURE_PX, type WorldLook } from "@lg/art";

const css = (hex: number): string => `#${hex.toString(16).padStart(6, "0")}`;

export function flowerAtlas(colors: WorldLook["vegetation"]["colors"]): Texture {
  const [w, h] = RUNTIME_TEXTURE_PX.flowerAtlas;
  const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  const g = canvas?.getContext("2d") ?? null;
  if (!canvas || !g) {
    const t = new DataTexture(new Uint8Array(4), 1, 1, RGBAFormat);
    t.needsUpdate = true;
    return t;
  }
  canvas.width = w;
  canvas.height = h;
  const cell = w / colors.flowers.length;
  const rnd = mulberry32(808);
  colors.flowers.forEach((k, c) => {
    const ox = c * cell;
    for (let i = 0; i < 7; i++) {
      const x = ox + 8 + rnd() * (cell - 16), top = 10 + rnd() * 30;
      g.strokeStyle = css(colors.flowerStem[i % 2] as number);
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(x + (rnd() - 0.5) * 6, h);
      g.quadraticCurveTo(x + (rnd() - 0.5) * 10, (h + top) / 2, x, top);
      g.stroke();
      g.fillStyle = css(colors.flowerLeaf);
      g.beginPath();
      g.ellipse(x + 3, (h + top) / 2 + 6, 4, 1.6, -0.6, 0, Math.PI * 2);
      g.fill();
      const r = k.radius * (0.8 + rnd() * 0.5);
      g.fillStyle = css(k.petal);
      for (let p = 0; p < k.petals; p++) {
        const a = (p / k.petals) * Math.PI * 2 + rnd();
        g.beginPath();
        g.ellipse(x + Math.cos(a) * r * 0.7, top + Math.sin(a) * r * 0.5, r * 0.62, r * 0.38, a, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = css(k.centre);
      g.beginPath();
      g.arc(x, top, r * 0.34, 0, Math.PI * 2);
      g.fill();
    }
  });
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
