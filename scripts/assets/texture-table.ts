// scripts/assets/texture-table.ts: la tabla de texturas del mundo abierto (open-world-3d T6 paso 0, D-832, AC74). Antes
// de codificar un solo .ktx2 imprime, por tier, cada textura que crea el mundo (mapas del suelo y de las rocas, hoja,
// corteza, impostores, atlas del pasto, flores, nubes, etiquetas, mapa de sombra y los lienzos de m7): medidas, mipmaps,
// formatos candidatos con sus bytes de GPU en el formato de escritorio (ETC1S y UASTC → BC7, `BASIS_TARGET`) y sus bytes de
// archivo, y los totales contra `maxTextureMb` (24 / 48 / 96 MB) y contra la descarga del muelle en `high`
// (`assets_muelle_mb` = 6 MB). Después recorre el orden fijo de recortes de PD-4 (1 normales de 1024 a 512, 2 normales
// en ETC1S, 3 sin normales de roca en medium, 4 sin normales del suelo en medium, 5 parar y preguntar) y dice el primer
// paso con el que todo entra: ese es el formato y tamaño elegido en `@lg/art` textures.ts. Con los .ktx2 ya versionados
// usa sus bytes y su cabecera reales en vez de la estimación.
//
//   node scripts/assets/texture-table.ts [--report <archivo.md>]   (npm run assets:texture-table)
//
// Sale con 1 si ningún paso hasta el 4 entra (paso 5: /develop se detiene y le pasa la tabla al operador, AC74).
import { existsSync, readFileSync, appendFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  estimatedFileBytes, gpuBytes, M7_TEXTURE_PX, mipLevels, OPEN_WORLD_TEXTURES, parseKtx2Header, ktx2GpuBytes,
  TIER_BUDGETS, WORLD_TIERS, type TextureFormat, type WorldTexture, type WorldTier,
} from "@lg/art";
import { loadBudgets } from "../budgets/bundle-size.ts";
import { DECODIFICADOR_BASIS } from "./inspect-budgets.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MB = 1024 * 1024;
const MBD = 1_000_000;
/** NPCs del muelle de Potosí (MITAYO, CERRO, FACTOR): dos etiquetas y una burbuja por NPC. */
export const MUELLE_NPCS = 3;

/**
 * Lo que el muelle baja en `high` además de las texturas, en bytes, medido en disco. Desde T7 también los árboles
 * horneados, las rocas y el personaje de Quaternius (antes estimados); check:budgets los cuenta en la descarga.
 */
export interface OtherDownload {
  id: string;
  bytes: number;
  measured: boolean;
}

const fileSize = (rel: string): number | null => {
  const abs = join(ROOT, rel);
  return existsSync(abs) ? statSync(abs).size : null;
};

const dirSize = (rel: string): number => {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return 0;
  return readdirSync(abs).reduce((n, f) => n + statSync(join(abs, f)).size, 0);
};

export function otherDownloads(): OtherDownload[] {
  // T7: el transcodificador servido es el de DECODIFICADOR_BASIS (apps/web/public/decoders/), el mismo que cuenta
  // inspect-budgets; el de three en node_modules queda como respaldo si todavía no está copiado.
  const transcoder = (pub: string): OtherDownload => {
    const name = pub.slice(pub.lastIndexOf("/") + 1);
    const bytes = fileSize(pub) ?? fileSize(`node_modules/three/examples/jsm/libs/basis/${name}`);
    return { id: pub.slice("apps/web/public/".length), bytes: bytes ?? 0, measured: bytes !== null };
  };
  return [
    { id: "decoders/meshopt_decoder.module.js", bytes: fileSize("apps/web/public/decoders/meshopt_decoder.module.js") ?? 0, measured: true },
    ...DECODIFICADOR_BASIS.map(transcoder),
    { id: "models/kaykit-adventurers-1 (personajes m7, cota de arriba)", bytes: dirSize("apps/web/public/models/kaykit-adventurers-1"), measured: true },
    { id: "models/generated/trees (T7, 7 especies × completo y liviano)", bytes: dirSize("apps/web/public/models/generated/trees"), measured: true },
    { id: "models/polyhaven (T7, 4 rocas × cerca y lejos)", bytes: dirSize("apps/web/public/models/polyhaven"), measured: true },
    { id: "models/quaternius-character-animated (personaje del mundo abierto, T7)", bytes: dirSize("apps/web/public/models/quaternius-character-animated"), measured: true },
  ];
}

/** Una variante del inventario: el paso de PD-4 aplicado cambia formato, tamaño o presencia de los mapas. */
type Variant = (t: WorldTexture) => WorldTexture;

/** El V6 tal cual: normales de 1024 y en UASTC (la calidad del mockup), difusos ETC1S. */
const v6: Variant = (t) => (t.normal ? { ...t, width: t.v6Px ?? t.width, height: t.v6Px ?? t.height, format: "uastc" } : t);
/**
 * El recorte 1 de PD-4 (normales de 1024 a 512) es para los mapas que en V6 son una sola imagen de 1024 (`v6Px`, las
 * normales del suelo). La normal de roca es un atlas 2 × 2 de escaneos de 512 (desviación T7): cada escaneo ya está en
 * 512, así que el atlas queda en 1024. Fix 1 de QA (hallazgo 6): antes se lo bajaba a 512 y las filas de los pasos no
 * describían lo servido (19,9 / 23,9 MB contra 20,9 / 24,9 del inventario, y el paso 1 parecía entrar).
 */
const to512: Variant = (t) => (t.v6Px ? { ...v6(t), width: 512, height: 512 } : v6(t));
/** Los pasos de PD-4, acumulativos (cada uno sobre el anterior). */
export const CUT_STEPS: readonly { step: number; label: string; apply: Variant }[] = [
  { step: 0, label: "V6 tal cual (normales 1024 UASTC)", apply: v6 },
  { step: 1, label: "normales de 1024 a 512", apply: (t) => (t.normal ? to512(t) : t) },
  { step: 2, label: "normales en ETC1S", apply: (t) => (t.normal ? { ...to512(t), format: "etc1s" } : t) },
  {
    step: 3, label: "sin normales de roca en medium",
    apply: (t) => (t.normal ? { ...to512(t), format: "etc1s", count: t.group === "rocas" ? { ...t.count, medium: 0 } : t.count } : t),
  },
  {
    step: 4, label: "sin normales del suelo en medium",
    apply: (t) => (t.normal ? { ...to512(t), format: "etc1s", count: { ...t.count, medium: 0 } } : t),
  },
];

/** Bytes de GPU y de archivo de una textura en la variante: de la cabecera del .ktx2 si existe y coincide, si no estimados. */
export function textureBytes(t: WorldTexture): { gpu: number; file: number; measured: boolean } {
  if (t.file && (t.format === "etc1s" || t.format === "uastc")) {
    const abs = join(ROOT, t.file);
    if (existsSync(abs)) {
      const bytes = new Uint8Array(readFileSync(abs));
      const h = parseKtx2Header(bytes);
      if (h.width === t.width && h.format === t.format) return { gpu: ktx2GpuBytes(h), file: bytes.byteLength, measured: true };
    }
  }
  return { gpu: gpuBytes(t, t.format), file: estimatedFileBytes(t, t.format), measured: false };
}

/** Memoria de GPU de lo que m7 ya crea en el tier (con las etiquetas típicas de la tabla). */
export function m7GpuBytes(tier: WorldTier, npcs = MUELLE_NPCS): number {
  const p = M7_TEXTURE_PX;
  const rgbaMips = (w: number, h: number): number => gpuBytes({ width: w, height: h, mips: true, alpha: true }, "rgba8");
  return rgbaMips(p.brush, p.brush) + p.ramp * 4 + p.blob * p.blob * 4 + p.beacons * p.beacon * p.beacon * 4
    + npcs * rgbaMips(p.bubble[0], p.bubble[1]) + 2 * npcs * rgbaMips(p.labelTypical[0], p.labelTypical[1])
    + (tier === "high" ? p.shadowMap * p.shadowMap * 4 : 0);
}

export interface TierTotals {
  gpuMb: Record<WorldTier, number>;
  /** Descarga del muelle en `high`: los .ktx2 que se cargan en high más lo demás (MB decimales, como check:budgets). */
  downloadMb: number;
  fits: boolean;
}

export function totals(inv: readonly WorldTexture[], others: readonly OtherDownload[], capMb: number): TierTotals {
  const gpuMb = {} as Record<WorldTier, number>;
  for (const tier of WORLD_TIERS) {
    const bytes = inv.reduce((n, t) => n + textureBytes(t).gpu * t.count[tier], 0) + m7GpuBytes(tier);
    gpuMb[tier] = bytes / MB;
  }
  const ktx = inv.filter((t) => t.count.high > 0).reduce((n, t) => n + textureBytes(t).file * t.count.high, 0);
  const downloadMb = (ktx + others.reduce((n, o) => n + o.bytes, 0)) / MBD;
  const fits = WORLD_TIERS.every((t) => gpuMb[t] <= TIER_BUDGETS[t].maxTextureMb) && downloadMb <= capMb;
  return { gpuMb, downloadMb, fits };
}

const kb = (b: number): string => `${Math.round(b / 1024)} KB`;
// M3 (QA, AC42/AC74): ETC1S cuenta en BC7 como UASTC (`BASIS_TARGET`: KTX2Loader elige BPTC antes que DXT).
const fmt = (f: TextureFormat): string => (f === "etc1s" ? "ETC1S→BC7" : f === "uastc" ? "UASTC→BC7" : f.toUpperCase());

export function renderTable(chosenStep: number, rows: readonly { step: number; label: string; t: TierTotals }[], others: readonly OtherDownload[], capMb: number): string {
  const out: string[] = [];
  out.push(`### Texturas del mundo abierto por tier (T6 paso 0, D-832, AC74)`, "");
  out.push("| Textura | Tarea | px | mips | Formato candidato: GPU (BC) / archivo | Elegido | low / medium / high |", "|---|---|---|---|---|---|---|");
  for (const t of OPEN_WORLD_TEXTURES) {
    // Los candidatos se miden al tamaño del mockup V6 (antes de cualquier recorte); el elegido, al de @lg/art.
    const v6size = { ...t, width: t.v6Px ?? t.width, height: t.v6Px ?? t.height };
    const cands = t.candidates.map((f) => `${fmt(f)}: ${kb(gpuBytes(v6size, f))} / ${kb(estimatedFileBytes(v6size, f))}`).join("; ");
    const b = textureBytes(t);
    const px = `${t.width}×${t.height}${t.v6Px ? ` (V6 ${t.v6Px})` : ""}`;
    out.push(`| ${t.id} | ${t.task} | ${px} | ${t.mips ? mipLevels(t.width, t.height) : 1} | ${cands} | ${fmt(t.format)} ${kb(b.gpu)} GPU, ${kb(b.file)} ${b.measured ? "archivo (medido)" : "archivo (estimado)"} | ${t.count.low} / ${t.count.medium} / ${t.count.high} |`);
  }
  const p = M7_TEXTURE_PX;
  out.push(`| m7: pincelada ${p.brush} px, rampa ${p.ramp} px, blob ${p.blob} px, ${p.beacons} balizas ${p.beacon} px, ${MUELLE_NPCS} burbujas ${p.bubble.join("×")}, ${2 * MUELLE_NPCS} etiquetas ~${p.labelTypical.join("×")} | m7 | varios | sí | RGBA8 | RGBA8 ${kb(m7GpuBytes("low"))} GPU | todos |`);
  out.push(`| m7: mapa de sombra ${p.shadowMap} (profundidad 32 bits) | m7 | ${p.shadowMap}×${p.shadowMap} | 1 | DEPTH32 | ${kb(p.shadowMap * p.shadowMap * 4)} GPU | 0 / 0 / 1 |`, "");
  out.push("Descarga del muelle en `high` además de las texturas:", "", "| Archivo | Bytes | |", "|---|---|---|");
  for (const o of others) out.push(`| ${o.id} | ${kb(o.bytes)} | ${o.measured ? "medido" : "estimado"} |`);
  out.push("", `Orden de recortes de PD-4 (topes: memoria ${WORLD_TIERS.map((t) => TIER_BUDGETS[t].maxTextureMb).join(" / ")} MB, descarga ${capMb} MB):`, "");
  out.push("| Paso | Variante | GPU low | GPU medium | GPU high | Descarga high | Entra |", "|---|---|---|---|---|---|---|");
  for (const r of rows) {
    out.push(`| ${r.step} | ${r.label} | ${r.t.gpuMb.low.toFixed(1)} MB | ${r.t.gpuMb.medium.toFixed(1)} MB | ${r.t.gpuMb.high.toFixed(1)} MB | ${r.t.downloadMb.toFixed(2)} MB | ${r.t.fits ? "sí" : "no"} |`);
  }
  out.push("", chosenStep >= 0
    ? `Elegido: paso ${chosenStep} (${rows.find((r) => r.step === chosenStep)?.label ?? ""}); es lo que fija @lg/art textures.ts.`
    : "Ningún paso hasta el 4 entra: paso 5, se detiene /develop y la tabla va al operador (AC74).");
  return out.join("\n");
}

/** Los totales de cada paso y el primero que entra (-1 si ninguno). */
export function evaluate(others: readonly OtherDownload[], capMb: number): { rows: { step: number; label: string; t: TierTotals }[]; chosen: number } {
  const rows = CUT_STEPS.map((s) => ({ step: s.step, label: s.label, t: totals(OPEN_WORLD_TEXTURES.map(s.apply), others, capMb) }));
  return { rows, chosen: rows.find((r) => r.t.fits)?.step ?? -1 };
}

export function run(argv: readonly string[] = process.argv.slice(2), log: (s: string) => void = console.log): number {
  const capMb = loadBudgets().assets_muelle_mb;
  const others = otherDownloads();
  const { rows, chosen } = evaluate(others, capMb);
  const md = renderTable(chosen, rows, others, capMb);
  log(md);
  // Lo elegido en @lg/art tiene que ser el paso que salió (sin esto, la tabla y el código podrían discrepar).
  const current = totals(OPEN_WORLD_TEXTURES, others, capMb);
  log(`
Inventario versionado (@lg/art): GPU ${WORLD_TIERS.map((t) => `${t} ${current.gpuMb[t].toFixed(1)} MB`).join(", ")}; descarga high ${current.downloadMb.toFixed(2)} MB; ${current.fits ? "entra" : "NO ENTRA"}.`);
  const i = argv.indexOf("--report");
  if (i >= 0 && argv[i + 1]) appendFileSync(resolve(argv[i + 1] as string), `\n${md}\n`);
  return chosen >= 0 && current.fits ? 0 : 1;
}

const invocado = process.argv[1];
if (invocado && import.meta.url === pathToFileURL(invocado).href) {
  process.exitCode = run();
}
