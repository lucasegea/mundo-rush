// Dialogue HUD rules (F4.2) that do not depend on React: which glossary states are shown in each build
// (03 §8.3, D-131), how a line is split into tappable words and the key a word uses to look up its entry.
// A word without an entry is NEVER translated (D-068): the UI offers "Marcar para repasar".

/** Value of `glossaryDisplay` in the compiled manifest (03 §8.3). */
export const GLOSSARY_DISPLAYS = ["dev", "release", "fv"] as const;
export type GlossaryDisplay = (typeof GLOSSARY_DISPLAYS)[number];

/** States of a glossary entry (D-067). */
export type GlossaryState = "draft" | "reviewed" | "approved";

/** How an entry is shown: hidden, as is, or with the visible "borrador" mark. */
export type GlossaryVisibility = "hidden" | "shown" | "draftMark";

/**
 * D-131: dev shows `approved` without a mark and `reviewed`/`draft` with the "borrador" mark; release only `approved`;
 * fv `approved` + `reviewed` (no mark, D-128), never `draft`.
 */
export function glossaryVisibility(state: GlossaryState, display: GlossaryDisplay): GlossaryVisibility {
  if (state === "approved") return "shown";
  if (display === "dev") return "draftMark";
  if (display === "fv" && state === "reviewed") return "shown";
  return "hidden";
}

export const isGlossaryDisplay = (v: unknown): v is GlossaryDisplay => (GLOSSARY_DISPLAYS as readonly unknown[]).includes(v);

/** Lookup key: lowercase, typographic apostrophe → straight, no punctuation around it. */
export function glossaryKey(word: string): string {
  return word.toLowerCase().replace(/[‘’]/g, "'").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

export interface LineToken {
  /** Text as is (word or separator). */
  text: string;
  /** Glossary key if it is a word; null if it is whitespace or punctuation. */
  key: string | null;
}

/** Splits a line into words (letters, digits, apostrophes and inner hyphens) and separators, losing nothing. */
export function tokenizeLine(text: string): LineToken[] {
  const out: LineToken[] = [];
  const re = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: text.slice(last, i), key: null });
    out.push({ text: m[0], key: glossaryKey(m[0]) });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), key: null });
  return out;
}

/** Strips the modeled-English markup from templates (***Corn.***) and fills the blanks that have no value. */
export function plainTemplateText(text: string): string {
  return text.replace(/\*{3}([^*]+)\*{3}/g, "$1").replace(/\{[a-z_0-9]+\}/g, "…");
}
