// check:contrast (F1.3 A4; GDD §5.4, §2.19): contraste WCAG de los tokens de color del HUD en
// apps/web/src/styles/tokens.css, en el tema normal y en alto contraste. Pares de texto ≥ 4,5:1 (AA);
// componentes no textuales (foco, bordes de controles) ≥ 3:1 (WCAG 1.4.11). Además, los pares de las etiquetas de
// nombre del mundo (plan estetica-c M1 A14, D-207) ≥ 7:1 (AAA), leídos de la paleta del mundo (una sola fuente de hex,
// sin copiarlos a tokens.css; desde M2 vienen de @lg/art).
// Plan estetica-c M4 (HUD "papel y tinta"): los pares del diálogo que piden AAA (≥ 7:1: tinta sobre papel, texto del
// chip sobre ámbar, botón primario papel sobre tinta), los no textuales nuevos (borde ámbar oscuro de los segmentos,
// punto de "tu turno") y la sincronía de hex: los tokens de tokens.css que vienen de la paleta de arte tienen que ser
// iguales a los de @lg/art (una sola fuente de los hex, revisión de arquitectura M1 A14). Un token desalineado hace salir 1.
//
// Uso: node scripts/a11y/contrast.ts [--tokens <archivo.css>]   Sale con 1 si un par no llega.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LABEL_CONTRAST_MIN, LABEL_CONTRAST_PAIRS, PALETTE, type PaletteToken } from "@lg/art";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const TOKENS_PATH = resolve(ROOT, "apps/web/src/styles/tokens.css");

export const TEXT_MIN = 4.5;
export const NON_TEXT_MIN = 3;
/** AAA (GDD: objetivo del diálogo). */
export const AAA_MIN = 7;

/** [primer plano, fondo] por nombre de token (sin el prefijo --lg-color-). Son los pares que usa ui/. */
export const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ["ink", "paper"], ["ink", "surface"], ["ink-muted", "paper"], ["ink-muted", "surface"],
  ["on-accent", "accent"], ["ink", "accent-soft"], ["ink-muted", "accent-soft"], ["danger", "paper"], ["danger", "surface"],
];
export const NON_TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ["focus", "paper"], ["focus", "surface"], ["focus", "accent-soft"], ["border", "paper"], ["border", "surface"], ["accent", "surface"],
  // M4: borde oscuro de los segmentos del medidor y punto verde de "tu turno", sobre la tarjeta de papel.
  ["amber-strong", "paper"], ["amber-strong", "surface"], ["turn", "paper"], ["turn", "surface"],
];
/** M4 (propuesta C §6): pares del HUD de diálogo que piden ≥ 7:1. */
export const AAA_PAIRS: readonly (readonly [string, string])[] = [
  ["ink", "paper"], ["on-amber", "amber"], ["paper", "ink"],
];

/** Token de tokens.css (sin --lg-color-) → token de la paleta de arte con el mismo hex (tema normal). */
export const PALETTE_TOKENS: Readonly<Record<string, PaletteToken>> = {
  paper: "papel",
  ink: "tinta",
  "ink-muted": "tinta-suave",
  amber: "ámbar",
  "amber-strong": "ámbar-osc",
  "on-amber": "chip-texto",
  "card-line": "papel-borde",
};

export type Theme = Record<string, string>;

const TOKEN_RE = /--lg-color-([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g;

/** Tokens de un bloque de reglas cuyo selector es exactamente `selector`. */
function block(css: string, selector: string): Theme {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return {};
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(TOKEN_RE)].map((m) => [m[1] ?? "", (m[2] ?? "").toLowerCase()]));
}

/** Tema normal (`:root`) y alto contraste (`:root[data-contrast="high"]`, que pisa al normal). */
export function parseThemes(css: string): { normal: Theme; high: Theme } {
  const normal = block(css, ":root");
  return { normal, high: { ...normal, ...block(css, ':root[data-contrast="high"]') } };
}

const channel = (c: number): number => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** Luminancia relativa WCAG de un #rrggbb. */
export function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export interface PairResult {
  theme: string;
  fg: string;
  bg: string;
  ratio: number;
  min: number;
  ok: boolean;
}

/** Chequea los pares en los dos temas. Un token que falta es un fallo (no un par salteado). */
export function checkContrast(css: string): PairResult[] {
  const themes = parseThemes(css);
  const out: PairResult[] = [];
  for (const [theme, tokens] of Object.entries(themes)) {
    for (const [pairs, min] of [[TEXT_PAIRS, TEXT_MIN], [NON_TEXT_PAIRS, NON_TEXT_MIN], [AAA_PAIRS, AAA_MIN]] as const) {
      for (const [fg, bg] of pairs) {
        const a = tokens[fg];
        const b = tokens[bg];
        const ratio = a && b ? Math.round(contrastRatio(a, b) * 100) / 100 : 0;
        out.push({ theme, fg, bg, ratio, min, ok: ratio >= min });
      }
    }
  }
  return out;
}

/** Un par de la paleta del mundo: hex directos, no tokens de tokens.css. */
export interface WorldPair {
  name: string;
  fg: string;
  bg: string;
}

/** Los pares de las etiquetas de nombre (A14) contra su mínimo (7:1). */
export function checkWorldLabels(pairs: readonly WorldPair[] = LABEL_CONTRAST_PAIRS, min: number = LABEL_CONTRAST_MIN): PairResult[] {
  return pairs.map((p) => {
    const valid = /^#[0-9a-fA-F]{6}$/.test(p.fg) && /^#[0-9a-fA-F]{6}$/.test(p.bg);
    const ratio = valid ? Math.round(contrastRatio(p.fg, p.bg) * 100) / 100 : 0;
    return { theme: "mundo", fg: p.name, bg: `${p.fg} / ${p.bg}`, ratio, min, ok: ratio >= min };
  });
}

export interface SyncResult {
  token: string;
  palette: PaletteToken;
  css: string | null;
  art: string;
  ok: boolean;
}

/** Los tokens de tokens.css que vienen de la paleta de arte, contra @lg/art (tema normal; mayúsculas no importan). */
export function checkPaletteSync(css: string, palette: Readonly<Record<string, string>> = PALETTE): SyncResult[] {
  const { normal } = parseThemes(css);
  return Object.entries(PALETTE_TOKENS).map(([token, name]) => {
    const art = (palette[name] ?? "").toLowerCase();
    const value = normal[token] ?? null;
    return { token, palette: name, css: value, art, ok: value !== null && value === art };
  });
}

export function run(path = TOKENS_PATH, log: (s: string) => void = console.log, worldPairs: readonly WorldPair[] = LABEL_CONTRAST_PAIRS): number {
  const css = readFileSync(path, "utf8");
  const results = [...checkContrast(css), ...checkWorldLabels(worldPairs)];
  for (const r of results) log(`${r.ok ? "OK  " : "FAIL"} [${r.theme}] ${r.fg} sobre ${r.bg}: ${r.ratio}:1 (mínimo ${r.min}:1)`);
  const sync = checkPaletteSync(css);
  for (const s of sync) log(`${s.ok ? "OK  " : "FAIL"} [paleta] --lg-color-${s.token} = ${s.css ?? "(falta)"}; @lg/art ${s.palette} = ${s.art}`);
  const failed = results.filter((r) => !r.ok).length + sync.filter((s) => !s.ok).length;
  log(failed === 0 ? `check:contrast OK: ${results.length} pares, ${sync.length} tokens de paleta` : `check:contrast: ${failed} par(es) o token(s) fuera de regla`);
  return failed === 0 ? 0 : 1;
}

const invoked = process.argv[1];
if (invoked && import.meta.url === pathToFileURL(invoked).href) {
  const i = process.argv.indexOf("--tokens");
  process.exitCode = run(i >= 0 && process.argv[i + 1] ? resolve(process.argv[i + 1] as string) : TOKENS_PATH);
}
