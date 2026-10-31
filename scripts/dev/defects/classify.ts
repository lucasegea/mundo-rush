// scripts/dev/defects/classify.ts: the Walk's pixel classifiers, pure (no browser), to test them with
// synthetic images. Port of the mockup V6's `tools/defects.cjs` (hsv, hue class, difference mask of two
// renders) and, since open-world-3d T8 (AC50, AC51), card strips, yellow next to grass and crown solidity. Since T6 AC39 (the
// default view's sky) and AC41 (the ground: yellow on the whole map and the grass bed's edge ring) use it.
// The images are RGBA top to bottom (those of a capture's getImageData), not the mockup's readPixels ones.

/** An RGBA image, rows top to bottom. */
export interface Rgba { width: number; height: number; data: Uint8Array | Uint8ClampedArray }

/** HSV with hue in degrees [0, 360), saturation and value in [0, 1] (defects.cjs's `hsv`). */
export function hsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx === mn) return [0, 0, mx / 255];
  const h = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
  return [(h * 60 + 360) % 360, (mx - mn) / mx, mx / 255];
}

/** 0 does not count (dirt, gray, deep shadow), 1 yellow (hue 40 to 72), 2 green (72 to 170): the mockup's `hueClass`. */
export function hueClass(r: number, g: number, b: number): 0 | 1 | 2 {
  const [h, s, v] = hsv(r, g, b);
  if (s < 0.25 || v < 0.15 || h < 40 || h >= 170) return 0;
  return h < 72 ? 1 : 2;
}

/** Mask of what changed between two renders (sum of |dR|+|dG|+|dB| greater than 24, the mockup's threshold). */
export function diffMask(a: Rgba, b: Rgba): Uint8Array {
  if (a.width !== b.width || a.height !== b.height) throw new Error("diffMask: imágenes de distinto tamaño");
  const m = new Uint8Array(a.width * a.height);
  for (let i = 0; i < m.length; i++) {
    const k = i * 4;
    m[i] = Math.abs((a.data[k] ?? 0) - (b.data[k] ?? 0)) + Math.abs((a.data[k + 1] ?? 0) - (b.data[k + 1] ?? 0)) + Math.abs((a.data[k + 2] ?? 0) - (b.data[k + 2] ?? 0)) > 24 ? 1 : 0;
  }
  return m;
}

/** The yellow share of yellow plus green among the chosen pixels (pixel indices); null if none counts. */
export function yellowShare(img: Rgba, pixels: Iterable<number>): { share: number | null; yellow: number; green: number } {
  let yellow = 0;
  let green = 0;
  for (const i of pixels) {
    const k = hueClass(img.data[i * 4] ?? 0, img.data[i * 4 + 1] ?? 0, img.data[i * 4 + 2] ?? 0);
    if (k === 1) yellow++;
    else if (k === 2) green++;
  }
  return { share: yellow + green > 0 ? yellow / (yellow + green) : null, yellow, green };
}

/** The indices of the pixels set to 1 in a mask. */
export function* maskPixels(mask: Uint8Array): Generator<number> {
  for (let i = 0; i < mask.length; i++) if (mask[i]) yield i;
}

/**
 * AC41 thresholds, fixed once (open-world-3d T6): yellow among the terrain pixels of the whole map (t = 1) at
 * most 0.35; at t = 0.55, the yellow of a ring just outside the edge of the grass bed minus that of one just
 * inside, at most 0.15. The rings go from 0.8 to 0.95 and from 1.05 to 1.2 radii of the grass disc.
 */
export const AC41 = { maxYellowFull: 0.35, maxRingStep: 0.15, inner: [0.8, 0.95], outer: [1.05, 1.2] } as const;

/**
 * AC39, fixed once (T6): the top band (10 % of the world's rows) is darker than the sky's horizon band (5 % of the
 * rows, above the silhouette) by 12 % or more of the horizon's luminance; green below 40 % or more.
 */
export const AC39 = { topRows: 0.1, horizonRows: 0.05, minLumaStep: 0.12, minGreenLower: 0.4 } as const;

const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** The share of dominant green pixels (G greater than R and B) in rows [y0, y1); with `visible`, among those. */
export function greenDominantShare(img: Rgba, y0: number, y1: number, visible?: Uint8Array): number {
  const a = Math.max(0, Math.floor(y0));
  const z = Math.min(img.height, Math.ceil(y1));
  let n = 0;
  let green = 0;
  for (let y = a; y < z; y++) {
    for (let x = 0; x < img.width; x++) {
      if (visible && !visible[y * img.width + x]) continue;
      const k = (y * img.width + x) * 4;
      const [r, g, b] = [img.data[k] ?? 0, img.data[k + 1] ?? 0, img.data[k + 2] ?? 0];
      if (g > r && g > b) green++;
      n++;
    }
  }
  return n === 0 ? 0 : green / n;
}

export interface SkyCheck { ok: boolean; lumaStep: number; topBlue: boolean; greenLower: number; detail: string }

/**
 * AC39: the top 10 % of rows is darker than the sky's horizon band by 12 % or more of the horizon's luminance
 * (SIGNED step: a flat or inverted sky fails), the top band is dominant blue and the bottom half
 * has 40 % or more dominant green pixels. Both bands look only at sky pixels: `sky` is the sky mask
 * (1 where the full capture equals the sky-only one, like AC41's double capture); without `sky`, everything above
 * `horizonY` is sky. The horizon band is, in each column, the `horizonRows` sky rows just
 * above the lowest sky pixel (above the hills' silhouette): the hills never enter it. `y0` is the first
 * row of the world (the title bar covers the top ones of the canvas) and `visible` the pixels that no HUD panel
 * covers: what counts is the world view, not the HUD.
 *
 * Recorded change (open-world-3d M3, QA AC39): before, the step was |top - horizon| and the horizon band
 * took the rows above `horizonY` with hills included; a flat sky (zenith = haze = horizon) passed with 12.4 %.
 */
export function skyCheck(img: Rgba, horizonY: number, y0 = 0, visible?: Uint8Array, sky?: Uint8Array): SkyCheck {
  const w = img.width;
  const view = img.height - y0;
  const first = Math.max(0, Math.floor(y0));
  const isSky = (x: number, y: number): boolean => {
    const i = y * w + x;
    return (sky ? sky[i] === 1 : y < horizonY) && (!visible || visible[i] === 1);
  };
  const acc = { top: { n: 0, r: 0, g: 0, b: 0 }, hz: { n: 0, r: 0, g: 0, b: 0 } };
  const add = (band: { n: number; r: number; g: number; b: number }, x: number, y: number): void => {
    const k = (y * w + x) * 4;
    band.r += img.data[k] ?? 0;
    band.g += img.data[k + 1] ?? 0;
    band.b += img.data[k + 2] ?? 0;
    band.n++;
  };
  const topEnd = Math.min(img.height, Math.ceil(y0 + view * AC39.topRows));
  const rows = Math.max(1, Math.round(view * AC39.horizonRows));
  for (let x = 0; x < w; x++) {
    for (let y = first; y < topEnd; y++) if (isSky(x, y)) add(acc.top, x, y);
    let low = -1;
    for (let y = img.height - 1; y >= first; y--) {
      if (isSky(x, y)) {
        low = y;
        break;
      }
    }
    if (low < 0) continue;
    for (let y = low; y > low - rows && y >= first; y--) if (isSky(x, y)) add(acc.hz, x, y);
  }
  const mean = (s: { n: number; r: number; g: number; b: number }) =>
    (s.n === 0 ? { n: 0, luma: 0, r: 0, g: 0, b: 0 } : { n: s.n, luma: luma(s.r / s.n, s.g / s.n, s.b / s.n), r: s.r / s.n, g: s.g / s.n, b: s.b / s.n });
  const top = mean(acc.top);
  const hz = mean(acc.hz);
  const lumaStep = top.n > 0 && hz.luma > 0 ? (hz.luma - top.luma) / hz.luma : 0;
  const topBlue = top.n > 0 && top.b > top.r && top.b > top.g;
  const greenLower = greenDominantShare(img, y0 + view / 2, img.height, visible);
  const ok = lumaStep >= AC39.minLumaStep && topBlue && greenLower >= AC39.minGreenLower;
  const f = (s: { r: number; g: number; b: number }): string => `(${s.r.toFixed(0)}, ${s.g.toFixed(0)}, ${s.b.toFixed(0)})`;
  return {
    ok, lumaStep, topBlue, greenLower,
    detail: `arriba ${f(top)} luma ${top.luma.toFixed(1)} (${top.n} px de cielo), horizonte del cielo ${f(hz)} luma ${hz.luma.toFixed(1)} ` +
      `(${hz.n} px, ${rows} filas sobre la silueta${sky ? "" : `, fila ${horizonY.toFixed(0)}`}): arriba más oscuro en ${(lumaStep * 100).toFixed(1)} % ` +
      `(min ${AC39.minLumaStep * 100}); arriba azul ${topBlue}; verde en la mitad de abajo ${(greenLower * 100).toFixed(1)} % (min ${AC39.minGreenLower * 100})`,
  };
}

// ---------- open-world-3d T8 (AC50, AC51): card strips, yellow next to grass and crown solidity ----------
// Port of the mockup V6's `tools/defects.cjs` (round 5). The masks are 0/1 top to bottom (row y, index y·w + x),
// not the mockup's readPixels ones (bottom to top); the rest is the same computation.

/** AC51 thresholds, the mockup's: strips, minimum coverage, yellow next to grass and crown solidity. */
export const AC51 = { maxStrips: 0.12, minCoverage: 0.03, maxYellow: 0.4, crown: 0.82, crownP20: 0.7, minTrees: 20 } as const;

type Pt = readonly [number, number];

/** Area of the convex hull (monotone chain) of pixel points, plus half a pixel per vertex and 1 (the mockup's). */
export function hullArea(input: readonly Pt[]): number {
  if (input.length < 3) return input.length;
  const pts = [...input].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cr = (o: Pt, a: Pt, b: Pt): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [];
  const up: Pt[] = [];
  for (const p of pts) {
    while (lo.length >= 2 && cr(lo[lo.length - 2] as Pt, lo[lo.length - 1] as Pt, p) <= 0) lo.pop();
    lo.push(p);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i] as Pt;
    while (up.length >= 2 && cr(up[up.length - 2] as Pt, up[up.length - 1] as Pt, p) <= 0) up.pop();
    up.push(p);
  }
  const hull = lo.slice(0, -1).concat(up.slice(0, -1));
  let a = 0;
  for (let i = 0; i < hull.length; i++) {
    const p = hull[i] as Pt;
    const q = hull[(i + 1) % hull.length] as Pt;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2 + hull.length / 2 + 1;
}

/** Area and solidity (area / convex hull) of the largest 4-connected blob inside a disc of the mask. */
export function blobSolidity(mask: Uint8Array, w: number, h: number, cx: number, cy: number, r: number): { area: number; solidity: number } {
  const side = 2 * r + 1;
  const seen = new Uint8Array(side * side);
  const idx = (x: number, y: number): number => (y - cy + r) * side + (x - cx + r);
  const ok = (x: number, y: number): boolean => (x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  let best: Pt[] = [];
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (!ok(x, y) || seen[idx(x, y)]) continue;
      const comp: Pt[] = [];
      const st: Pt[] = [[x, y]];
      seen[idx(x, y)] = 1;
      while (st.length) {
        const [px, py] = st.pop() as Pt;
        comp.push([px, py]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = px + dx;
          const ny = py + dy;
          if (ok(nx, ny) && !seen[idx(nx, ny)]) {
            seen[idx(nx, ny)] = 1;
            st.push([nx, ny]);
          }
        }
      }
      if (comp.length > best.length) best = comp;
    }
  }
  return { area: best.length, solidity: best.length ? best.length / hullArea(best) : 0 };
}

/** Erosion with a cross of arm `r` (the mockup's morphology), not touching the `r` px border. */
export function erode(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const o = new Uint8Array(m.length);
  for (let y = r; y < h - r; y++) {
    for (let x = r; x < w - r; x++) {
      let k = 1;
      for (let d = -r; d <= r && k; d++) if (!m[y * w + x + d] || !m[(y + d) * w + x]) k = 0;
      o[y * w + x] = k;
    }
  }
  return o;
}

/** Dilation with the same cross. */
export function dilate(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const o = new Uint8Array(m.length);
  for (let y = r; y < h - r; y++) {
    for (let x = r; x < w - r; x++) {
      if (!m[y * w + x]) continue;
      for (let d = -r; d <= r; d++) {
        o[y * w + x + d] = 1;
        o[(y + d) * w + x] = 1;
      }
    }
  }
  return o;
}

/**
 * Card strips: the mask is opened (thin leaves and tips go; the dense band at the foot of an edge-on
 * card remains) and the share of what remains in blobs of at least 30 px with an elongation (square root of the
 * ratio of the covariance eigenvalues) of 3.5 or more is measured.
 */
export function stripFraction(mask: Uint8Array, w: number, h: number): number {
  const op = dilate(erode(mask, w, h, 2), w, h, 2);
  const seen = new Uint8Array(op.length);
  let tot = 0;
  let strip = 0;
  for (let i = 0; i < op.length; i++) {
    if (!op[i] || seen[i]) continue;
    const st = [i];
    seen[i] = 1;
    let n = 0;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    while (st.length) {
      const j = st.pop() as number;
      const x = j % w;
      const y = Math.floor(j / w);
      n++;
      sx += x;
      sy += y;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
      for (const k of [j + 1, j - 1, j + w, j - w]) {
        if (k >= 0 && k < op.length && op[k] && !seen[k]) {
          seen[k] = 1;
          st.push(k);
        }
      }
    }
    if (n < 30) continue;
    const mx = sx / n;
    const my = sy / n;
    const a = sxx / n - mx * mx;
    const c = syy / n - my * my;
    const b = sxy / n - mx * my;
    const half = (a + c) / 2;
    const root = Math.sqrt(Math.max(0, half * half - (a * c - b * b)));
    tot += n;
    if (Math.sqrt((half + root) / Math.max(half - root, 0.25)) >= 3.5) strip += n;
  }
  return tot ? Number((strip / tot).toFixed(3)) : 0;
}

/**
 * The ground between the grass: in the capture WITHOUT grass, the pixels 10 px or less from a grass pixel that are not under
 * one, yellow over yellow plus green. `visible` leaves out what the HUD covers.
 */
export function yellowNearGrass(mask: Uint8Array, noGrass: Rgba, visible?: Uint8Array): number {
  const { width: w, height: h } = noGrass;
  const zone = dilate(dilate(mask, w, h, 5), w, h, 5);
  let yel = 0;
  let grn = 0;
  for (let i = 0; i < zone.length; i++) {
    if (!zone[i] || mask[i] || (visible && !visible[i])) continue;
    const k = hueClass(noGrass.data[i * 4] ?? 0, noGrass.data[i * 4 + 1] ?? 0, noGrass.data[i * 4 + 2] ?? 0);
    if (k === 1) yel++;
    else if (k === 2) grn++;
  }
  return yel + grn ? Number((yel / (yel + grn)).toFixed(3)) : 0;
}

/** The grass in the bottom 60 % of the frame (the meadow around the player): coverage, strips and nearby yellow. */
export function grassDefects(withGrass: Rgba, noGrass: Rgba, visible?: Uint8Array): { coverage: number; strips: number; yellow: number } {
  const { width: w, height: h } = withGrass;
  const full = diffMask(withGrass, noGrass);
  const y0 = Math.round(h * 0.4);
  const mask = new Uint8Array(full.length);
  mask.set(full.subarray(y0 * w), y0 * w);
  if (visible) for (let i = 0; i < mask.length; i++) if (!visible[i]) mask[i] = 0;
  let n = 0;
  for (let i = y0 * w; i < mask.length; i++) n += mask[i] as number;
  return { coverage: Number((n / ((h - y0) * w)).toFixed(3)), strips: stripFraction(mask, w, h), yellow: yellowNearGrass(mask, noGrass, visible) };
}

/** A projected tree: crown center in pixels (top to bottom), NDC depth and radius in pixels. */
export interface ProjectedTree { x: number; y: number; z: number; r: number }

/**
 * Crowns (mockup `trees`): of each tree whose crown does not touch a neighbor's on screen, the blob solidity inside
 * a disc of 1.15 radii around the projected center; median and 20th percentile of those measuring more than 12 px.
 */
export function crownSolidity(mask: Uint8Array, w: number, h: number, items: readonly ProjectedTree[]): { trees: number; measured: number; median: number; p20: number } {
  const iso = items.filter((t) => t.z < 1 && t.x > 2 * t.r && t.y > 2 * t.r && t.x + 2 * t.r < w && t.y + 2 * t.r < h
    && !items.some((o) => o !== t && Math.hypot(o.x - t.x, o.y - t.y) < o.r + t.r));
  const sol = iso.map((t) => blobSolidity(mask, w, h, t.x, t.y, Math.round(t.r * 1.15))).filter((b) => b.area > 12).map((b) => b.solidity).sort((p, q) => p - q);
  const at = (f: number): number => (sol.length ? Number((sol[Math.min(sol.length - 1, Math.floor(sol.length * f))] as number).toFixed(3)) : 0);
  return { trees: items.length, measured: sol.length, median: at(0.5), p20: at(0.2) };
}

/**
 * The mockup's negative controls on synthetic masks (AC50): a torn disc is a crown and an X is not; a field
 * of tufts (round foot, thin leaves) is not strips and one of dense strips is; a meadow green is green and a mustard is
 * yellow. They do not depend on the scene.
 */
export function syntheticControls(): { disc: number; x: number; strips: number; tufts: number; meadow: 0 | 1 | 2; mustard: 0 | 1 | 2 } {
  const w = 400;
  const h = 200;
  const m = new Uint8Array(w * h);
  const put = (x: number, y: number): void => {
    if (x >= 0 && y >= 0 && x < w && y < h) m[y * w + x] = 1;
  };
  for (let y = -24; y <= 24; y++) for (let x = -24; x <= 24; x++) if (x * x + y * y <= 576 && (x * 7 + y * 13) % 11) put(100 + x, 100 + y);
  for (let t = -30; t <= 30; t++) {
    for (let k = -2; k <= 2; k++) {
      put(300 + t + k, 100 + t);
      put(300 + t + k, 100 - t);
    }
  }
  const disc = blobSolidity(m, w, h, 100, 100, 38).solidity;
  const x = blobSolidity(m, w, h, 300, 100, 38).solidity;
  const s = new Uint8Array(w * h);
  const f = new Uint8Array(w * h);
  for (let i = 0; i < 8; i++) {
    for (let t = 0; t < 60; t++) {
      for (let k = 0; k < 8; k++) {
        const xx = 20 + i * 45 + Math.round(t * 0.5);
        const yy = 20 + t + k;
        if (xx < w && yy < h) s[yy * w + xx] = 1;
      }
    }
  }
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 4; j++) {
      const cx = 25 + i * 48;
      const cy = 25 + j * 45;
      for (let y = -5; y <= 5; y++) for (let xx = -5; xx <= 5; xx++) if (xx * xx + y * y <= 25) f[(cy + y) * w + cx + xx] = 1;
      for (let b = -3; b <= 3; b++) for (let t = 0; t < 18; t++) f[(cy + 5 + t) * w + cx + Math.round(b * t * 0.4)] = 1;
    }
  }
  return {
    disc: Number(disc.toFixed(3)), x: Number(x.toFixed(3)), strips: stripFraction(s, w, h), tufts: stripFraction(f, w, h),
    meadow: hueClass(96, 150, 52), mustard: hueClass(178, 168, 48),
  };
}

// ---------- open-world-3d T8 (AC52): the captures at the three NPCs are not the same view ----------

/**
 * AC52 threshold, fixed once on the GPU render (T8): the captures on reaching each NPC differ pairwise
 * by more than `minDistance` bits of the 64-bit difference hash. The same view gives 0; two views of the same meadow with
 * another framing, more than 10 (measured in the Walk report).
 */
export const AC52 = { minDistance: 10 } as const;

/**
 * Perceptual difference hash (dHash, 64 bits): the gray image averaged to 9 × 8 cells, one bit per pair of
 * neighboring cells in each row (1 if the left one is lighter). `visible` (optional) leaves out what the HUD covers.
 */
export function differenceHash(img: Rgba, visible?: Uint8Array): bigint {
  const cols = 9;
  const rows = 8;
  const sum = new Float64Array(cols * rows);
  const n = new Float64Array(cols * rows);
  for (let y = 0; y < img.height; y++) {
    const cy = Math.min(rows - 1, Math.floor((y * rows) / img.height));
    for (let x = 0; x < img.width; x++) {
      const i = y * img.width + x;
      if (visible && !visible[i]) continue;
      const cx = Math.min(cols - 1, Math.floor((x * cols) / img.width));
      const k = i * 4;
      const c = cy * cols + cx;
      sum[c] = (sum[c] as number) + luma(img.data[k] ?? 0, img.data[k + 1] ?? 0, img.data[k + 2] ?? 0);
      n[c] = (n[c] as number) + 1;
    }
  }
  let hash = 0n;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols - 1; x++) {
      const a = (sum[y * cols + x] as number) / Math.max(1, n[y * cols + x] as number);
      const b = (sum[y * cols + x + 1] as number) / Math.max(1, n[y * cols + x + 1] as number);
      hash = (hash << 1n) | (a > b ? 1n : 0n);
    }
  }
  return hash;
}

/** Differing bits between two hashes. */
export function hashDistance(a: bigint, b: bigint): number {
  let d = a ^ b;
  let n = 0;
  while (d > 0n) {
    n += Number(d & 1n);
    d >>= 1n;
  }
  return n;
}

/** AC52: the distance of each pair of captures and whether all pass the threshold. */
export function pairwiseDistinct(images: readonly Rgba[], visible?: Uint8Array): { ok: boolean; distances: number[] } {
  const hashes = images.map((im) => differenceHash(im, visible));
  const distances: number[] = [];
  for (let i = 0; i < hashes.length; i++) for (let j = i + 1; j < hashes.length; j++) distances.push(hashDistance(hashes[i] as bigint, hashes[j] as bigint));
  return { ok: distances.length > 0 && distances.every((d) => d > AC52.minDistance), distances };
}
