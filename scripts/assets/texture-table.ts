// scripts/assets/texture-table.ts: the open world's texture table (open-world-3d T6 step 0, D-832, AC74). Before
// encoding a single .ktx2 it prints, per tier, each texture the world creates (ground and rock maps, leaf,
// bark, impostors, grass atlas, flowers, clouds, labels, shadow map and m7's canvases): sizes, mipmaps,
// candidate formats with their GPU bytes in the desktop format (ETC1S and UASTC → BC7, `BASIS_TARGET`) and their file
// bytes, and the totals against `maxTextureMb` (24 / 48 / 96 MB) and against the dock's download on `high`
// (`assets_muelle_mb` = 6 MB). Then it walks PD-4's fixed order of cuts (1 normals from 1024 to 512, 2 normals
// in ETC1S, 3 no rock normals on medium, 4 no ground normals on medium, 5 stop and ask) and says the first
// step at which everything fits: that is the format and size chosen in `@lg/art` textures.ts. With the .ktx2 files already versioned
// it uses their real bytes and header instead of the estimate.
// Open-world-3d T7b (D-841): the inventory is that of a look (`worldTextures(look)`) and the download adds its trees and rocks
// (`natureModelFiles(look)`); run() prints the table of each look of the WORLD_LOOKS catalog and each has to fit
// alone in 24 / 48 / 96 MB and in the 6 MB download.
//
//   node scripts/assets/texture-table.ts [--report <archivo.md>]   (npm run assets:texture-table)
//
// Exits with 1 if no step up to 4 fits (step 5: /develop stops and hands the table to the operator, AC74).
import { existsSync, readFileSync, appendFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  estimatedFileBytes, gpuBytes, M7_TEXTURE_PX, mipLevels, natureModelFiles, parseKtx2Header, ktx2GpuBytes, ROCK_MODELS_DIR,
  TIER_BUDGETS, TREES_DIR, WORLD_LOOKS, WORLD_TIERS, worldTextures, type TextureFormat, type WorldLook, type WorldTexture, type WorldTier,
} from "@lg/art";
import { loadBudgets } from "../budgets/bundle-size.ts";
import { DECODIFICADOR_BASIS } from "./inspect-budgets.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MB = 1024 * 1024;
const MBD = 1_000_000;
/** NPCs of the Potosí dock (MITAYO, CERRO, FACTOR): two labels and a bubble per NPC. */
export const MUELLE_NPCS = 3;

/**
 * What the dock downloads on `high` besides the textures, in bytes, measured on disk. Since T7 also the baked
 * trees, the rocks and the Quaternius character (before, estimated); check:budgets counts them in the download.
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

/** The nature .glb files of the look that fall in `dir` (trees or rocks), summed. */
const natureBytes = (look: WorldLook, dir: string): number =>
  natureModelFiles(look).filter((f) => f.startsWith(`${dir}/`)).reduce((n, f) => n + (fileSize(f) ?? 0), 0);

export function otherDownloads(look: WorldLook): OtherDownload[] {
  // T7: the served transcoder is DECODIFICADOR_BASIS's (apps/web/public/decoders/), the same one that
  // inspect-budgets counts; three's in node_modules stays as a fallback if it is not copied yet.
  const transcoder = (pub: string): OtherDownload => {
    const name = pub.slice(pub.lastIndexOf("/") + 1);
    const bytes = fileSize(pub) ?? fileSize(`node_modules/three/examples/jsm/libs/basis/${name}`);
    return { id: pub.slice("apps/web/public/".length), bytes: bytes ?? 0, measured: bytes !== null };
  };
  return [
    { id: "decoders/meshopt_decoder.module.js", bytes: fileSize("apps/web/public/decoders/meshopt_decoder.module.js") ?? 0, measured: true },
    ...DECODIFICADOR_BASIS.map(transcoder),
    { id: "models/kaykit-adventurers-1 (personajes m7, cota de arriba)", bytes: dirSize("apps/web/public/models/kaykit-adventurers-1"), measured: true },
    { id: `models/generated/trees (T7, ${look.vegetation.species.length} especies × completo y liviano)`, bytes: natureBytes(look, TREES_DIR), measured: true },
    { id: `models/polyhaven (T7, ${look.vegetation.rockScans.length} rocas × cerca y lejos)`, bytes: natureBytes(look, ROCK_MODELS_DIR), measured: true },
    { id: "models/quaternius-character-animated (personaje del mundo abierto, T7)", bytes: dirSize("apps/web/public/models/quaternius-character-animated"), measured: true },
  ];
}

/** A variant of the inventory: the applied PD-4 step changes the maps' format, size or presence. */
type Variant = (t: WorldTexture) => WorldTexture;

/** V6 as is: 1024 normals in UASTC (the mockup's quality), ETC1S diffuse. */
const v6: Variant = (t) => (t.normal ? { ...t, width: t.v6Px ?? t.width, height: t.v6Px ?? t.height, format: "uastc" } : t);
/**
 * PD-4's cut 1 (normals from 1024 to 512) is for the maps that in V6 are a single 1024 image (`v6Px`, the ground
 * normals). The rock normal is a 2 × 2 atlas of 512 scans (T7 deviation): each scan is already at
 * 512, so the atlas stays at 1024. QA's fix 1 (finding 6): before, it was lowered to 512 and the step rows did not
 * describe what is served (19.9 / 23.9 MB against the inventory's 20.9 / 24.9, and step 1 appeared to fit).
 */
const to512: Variant = (t) => (t.v6Px ? { ...v6(t), width: 512, height: 512 } : v6(t));
/** PD-4's steps, cumulative (each on top of the previous one). */
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

/** GPU and file bytes of a texture in the variant: from the .ktx2 header if it exists and matches, otherwise estimated. */
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

/** GPU memory of what m7 already creates in the tier (with the table's typical labels). */
export function m7GpuBytes(tier: WorldTier, npcs = MUELLE_NPCS): number {
  const p = M7_TEXTURE_PX;
  const rgbaMips = (w: number, h: number): number => gpuBytes({ width: w, height: h, mips: true, alpha: true }, "rgba8");
  return rgbaMips(p.brush, p.brush) + p.ramp * 4 + p.blob * p.blob * 4 + p.beacons * p.beacon * p.beacon * 4
    + npcs * rgbaMips(p.bubble[0], p.bubble[1]) + 2 * npcs * rgbaMips(p.labelTypical[0], p.labelTypical[1])
    + (tier === "high" ? p.shadowMap * p.shadowMap * 4 : 0);
}

export interface TierTotals {
  gpuMb: Record<WorldTier, number>;
  /** Dock download on `high`: the .ktx2 files loaded on high plus the rest (decimal MB, like check:budgets). */
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
// M3 (QA, AC42/AC74): ETC1S counts in BC7 as UASTC (`BASIS_TARGET`: KTX2Loader picks BPTC before DXT).
const fmt = (f: TextureFormat): string => (f === "etc1s" ? "ETC1S→BC7" : f === "uastc" ? "UASTC→BC7" : f.toUpperCase());

export function renderTable(
  chosenStep: number, rows: readonly { step: number; label: string; t: TierTotals }[], others: readonly OtherDownload[], capMb: number,
  inv: readonly WorldTexture[], lookId: string,
): string {
  const out: string[] = [];
  out.push(`### Texturas del mundo abierto por tier, look \`${lookId}\` (T6 paso 0, D-832, AC74; T7b D-841)`, "");
  out.push("| Textura | Tarea | px | mips | Formato candidato: GPU (BC) / archivo | Elegido | low / medium / high |", "|---|---|---|---|---|---|---|");
  for (const t of inv) {
    // The candidates are measured at the mockup V6 size (before any cut); the chosen one, at @lg/art's.
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

/** The totals of each step and the first one that fits (-1 if none), over a look's inventory. */
export function evaluate(
  others: readonly OtherDownload[], capMb: number, inv: readonly WorldTexture[],
): { rows: { step: number; label: string; t: TierTotals }[]; chosen: number } {
  const rows = CUT_STEPS.map((s) => ({ step: s.step, label: s.label, t: totals(inv.map(s.apply), others, capMb) }));
  return { rows, chosen: rows.find((r) => r.t.fits)?.step ?? -1 };
}

export function run(argv: readonly string[] = process.argv.slice(2), log: (s: string) => void = console.log): number {
  const capMb = loadBudgets().assets_muelle_mb;
  let code = 0;
  for (const look of Object.values(WORLD_LOOKS)) {
    const inv = worldTextures(look);
    const others = otherDownloads(look);
    const { rows, chosen } = evaluate(others, capMb, inv);
    const md = renderTable(chosen, rows, others, capMb, inv, look.id);
    log(md);
    // What is chosen in @lg/art has to be the step that came out (without this, the table and the code could disagree).
    const current = totals(inv, others, capMb);
    log(`
Inventario versionado (@lg/art), look ${look.id}: GPU ${WORLD_TIERS.map((t) => `${t} ${current.gpuMb[t].toFixed(1)} MB`).join(", ")}; descarga high ${current.downloadMb.toFixed(2)} MB; ${current.fits ? "entra" : "NO ENTRA"}.
`);
    const i = argv.indexOf("--report");
    if (i >= 0 && argv[i + 1]) appendFileSync(resolve(argv[i + 1] as string), `\n${md}\n`);
    if (!(chosen >= 0 && current.fits)) code = 1;
  }
  return code;
}

const invocado = process.argv[1];
if (invocado && import.meta.url === pathToFileURL(invocado).href) {
  process.exitCode = run();
}
