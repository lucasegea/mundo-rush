// check:contrast (F1.3 A4; GDD §5.4, §2.19): WCAG contrast of the HUD color tokens in
// apps/web/src/styles/tokens.css, in the normal and high-contrast themes. Text pairs ≥ 4.5:1 (AA);
// non-text components (focus, control borders) ≥ 3:1 (WCAG 1.4.11). Also, the pairs of the world's name
// labels (plan estetica-c M1 A14, D-207) ≥ 7:1 (AAA), read from the world palette (a single source of hex,
// not copied to tokens.css; since M2 they come from @lg/art).
// Plan estetica-c M4 (HUD "paper and ink"): the dialogue pairs that ask for AAA (≥ 7:1: ink on paper, chip
// text on amber, primary button paper on ink), the new non-text ones (dark amber border of the segments,
// "your turn" dot) and hex sync: the tokens.css tokens that come from the art palette must be
// equal to those of @lg/art (a single source of hex, architecture review M1 A14). A misaligned token makes it exit 1.
//
// Usage: node scripts/a11y/contrast.ts [--tokens <file.css>]   Exits with 1 if a pair falls short.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LABEL_CONTRAST_MIN, LABEL_CONTRAST_PAIRS, PALETTE, type PaletteToken } from "@lg/art";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const TOKENS_PATH = resolve(ROOT, "apps/web/src/styles/tokens.css");

export const TEXT_MIN = 4.5;
export const NON_TEXT_MIN = 3;
/** AAA (GDD: dialogue target). */
export const AAA_MIN = 7;

/** [foreground, background] by token name (without the --lg-color- prefix). These are the pairs ui/ uses. */
export const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ["ink", "paper"], ["ink", "surface"], ["ink-muted", "paper"], ["ink-muted", "surface"],
  ["on-accent", "accent"], ["ink", "accent-soft"], ["ink-muted", "accent-soft"], ["danger", "paper"], ["danger", "surface"],
];
export const NON_TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ["focus", "paper"], ["focus", "surface"], ["focus", "accent-soft"], ["border", "paper"], ["border", "surface"], ["accent", "surface"],
  // M4: dark border of the meter segments and green "your turn" dot, over the paper card.
  ["amber-strong", "paper"], ["amber-strong", "surface"], ["turn", "paper"], ["turn", "surface"],
];
/** M4 (proposal C §6): dialogue HUD pairs that ask for ≥ 7:1. */
export const AAA_PAIRS: readonly (readonly [string, string])[] = [
  ["ink", "paper"], ["on-amber", "amber"], ["paper", "ink"],
];

/** tokens.css token (without --lg-color-) → art palette token with the same hex (normal theme). */
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

/** Tokens of a rule block whose selector is exactly `selector`. */
function block(css: string, selector: string): Theme {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return {};
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(TOKEN_RE)].map((m) => [m[1] ?? "", (m[2] ?? "").toLowerCase()]));
}

/** Normal theme (`:root`) and high contrast (`:root[data-contrast="high"]`, which overrides the normal one). */
export function parseThemes(css: string): { normal: Theme; high: Theme } {
  const normal = block(css, ":root");
  return { normal, high: { ...normal, ...block(css, ':root[data-contrast="high"]') } };
}

const channel = (c: number): number => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance of a #rrggbb. */
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

/** Checks the pairs in both themes. A missing token is a failure (not a skipped pair). */
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

/** A pair of the world palette: direct hex, not tokens.css tokens. */
export interface WorldPair {
  name: string;
  fg: string;
  bg: string;
}

/** The name-label pairs (A14) against their minimum (7:1). */
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

/** The tokens.css tokens that come from the art palette, against @lg/art (normal theme; case does not matter). */
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
