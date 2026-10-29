// scripts/dev/defects/classify.ts: los clasificadores de píxeles de la Walk, puros (sin navegador), para probarlos con
// imágenes sintéticas. Port de `tools/defects.cjs` del mockup V6 (hsv, clase de tono, máscara de diferencia de dos
// render), que open-world-3d T8 completa con las tiras de tarjetas y la solidez de copas. Desde T6 lo usan AC39 (el
// cielo de la vista por defecto) y AC41 (el suelo: amarillo en el mapa entero y el anillo del borde de la cama de pasto).
// Las imágenes son RGBA de arriba abajo (las de getImageData de una captura), no las de readPixels del mockup.

/** Una imagen RGBA, filas de arriba abajo. */
export interface Rgba { width: number; height: number; data: Uint8Array | Uint8ClampedArray }

/** HSV con el tono en grados [0, 360), la saturación y el valor en [0, 1] (el `hsv` de defects.cjs). */
export function hsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx === mn) return [0, 0, mx / 255];
  const h = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
  return [(h * 60 + 360) % 360, (mx - mn) / mx, mx / 255];
}

/** 0 no cuenta (tierra, gris, sombra honda), 1 amarillo (tono 40 a 72), 2 verde (72 a 170): el `hueClass` del mockup. */
export function hueClass(r: number, g: number, b: number): 0 | 1 | 2 {
  const [h, s, v] = hsv(r, g, b);
  if (s < 0.25 || v < 0.15 || h < 40 || h >= 170) return 0;
  return h < 72 ? 1 : 2;
}

/** Máscara de lo que cambió entre dos render (suma de |dR|+|dG|+|dB| mayor que 24, el umbral del mockup). */
export function diffMask(a: Rgba, b: Rgba): Uint8Array {
  if (a.width !== b.width || a.height !== b.height) throw new Error("diffMask: imágenes de distinto tamaño");
  const m = new Uint8Array(a.width * a.height);
  for (let i = 0; i < m.length; i++) {
    const k = i * 4;
    m[i] = Math.abs((a.data[k] ?? 0) - (b.data[k] ?? 0)) + Math.abs((a.data[k + 1] ?? 0) - (b.data[k + 1] ?? 0)) + Math.abs((a.data[k + 2] ?? 0) - (b.data[k + 2] ?? 0)) > 24 ? 1 : 0;
  }
  return m;
}

/** La parte amarilla de amarillo más verde entre los píxeles elegidos (índices de píxel); null si ninguno cuenta. */
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

/** Los índices de los píxeles en 1 de una máscara. */
export function* maskPixels(mask: Uint8Array): Generator<number> {
  for (let i = 0; i < mask.length; i++) if (mask[i]) yield i;
}

/**
 * Umbrales de AC41, fijados una vez (open-world-3d T6): amarillo entre los píxeles de terreno del mapa entero (t = 1) a
 * lo sumo 0,35; a t = 0,55, el amarillo de un anillo justo fuera del borde de la cama de pasto menos el de uno justo
 * dentro, a lo sumo 0,15. Los anillos van de 0,8 a 0,95 y de 1,05 a 1,2 radios del disco de pasto.
 */
export const AC41 = { maxYellowFull: 0.35, maxRingStep: 0.15, inner: [0.8, 0.95], outer: [1.05, 1.2] } as const;

/**
 * AC39, fijado una vez (T6): la banda de arriba (10 % de las filas del mundo) es más oscura que la del horizonte del
 * cielo (5 % de las filas, sobre la silueta) en 12 % o más de la luminancia del horizonte; verde abajo 40 % o más.
 */
export const AC39 = { topRows: 0.1, horizonRows: 0.05, minLumaStep: 0.12, minGreenLower: 0.4 } as const;

const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** La parte de píxeles verdes dominantes (G mayor que R y que B) en las filas [y0, y1); con `visible`, entre esos. */
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
 * AC39: el 10 % de filas de arriba es más oscuro que la banda del horizonte del cielo en 12 % o más de la luminancia del
 * horizonte (paso CON signo: un cielo plano o invertido falla), la banda de arriba es azul dominante y la mitad de abajo
 * tiene 40 % o más de píxeles verdes dominantes. Las dos bandas miran solo píxeles de cielo: `sky` es la máscara del
 * cielo (1 donde la captura completa es igual a la del cielo solo, como la doble captura de AC41); sin `sky`, es cielo
 * todo lo que está sobre `horizonY`. La banda del horizonte es, en cada columna, las `horizonRows` filas de cielo justo
 * encima del píxel de cielo más bajo (sobre la silueta de las lomas): las lomas nunca entran en ella. `y0` es la primera
 * fila del mundo (la barra del título tapa las de arriba del canvas) y `visible` los píxeles que ningún panel del HUD
 * tapa: lo que cuenta es la vista del mundo, no el HUD.
 *
 * Cambio registrado (open-world-3d M3, QA AC39): antes el paso era |arriba - horizonte| y la banda del horizonte
 * tomaba las filas sobre `horizonY` con lomas incluidas; un cielo plano (cénit = bruma = horizonte) pasaba con 12,4 %.
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
