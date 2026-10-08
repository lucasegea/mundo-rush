// Reglas del HUD de diálogo (F4.2) que no dependen de React: qué estados del glosario se muestran en cada build
// (03 §8.3, D-131), cómo se parte una línea en palabras tocables y la clave con la que una palabra busca su entrada.
// Una palabra sin entrada NUNCA se traduce (D-068): la UI ofrece "Marcar para repasar".

/** Valor de `glossaryDisplay` del manifiesto compilado (03 §8.3). */
export const GLOSSARY_DISPLAYS = ["dev", "release", "fv"] as const;
export type GlossaryDisplay = (typeof GLOSSARY_DISPLAYS)[number];

/** Estados de una entrada del glosario (D-067). */
export type GlossaryState = "draft" | "reviewed" | "approved";

/** Cómo se muestra una entrada: oculta, tal cual, o con la marca visible "borrador". */
export type GlossaryVisibility = "hidden" | "shown" | "draftMark";

/**
 * D-131: dev muestra `approved` sin marca y `reviewed`/`draft` con la marca "borrador"; release solo `approved`;
 * fv `approved` + `reviewed` (sin marca, D-128), nunca `draft`.
 */
export function glossaryVisibility(state: GlossaryState, display: GlossaryDisplay): GlossaryVisibility {
  if (state === "approved") return "shown";
  if (display === "dev") return "draftMark";
  if (display === "fv" && state === "reviewed") return "shown";
  return "hidden";
}

export const isGlossaryDisplay = (v: unknown): v is GlossaryDisplay => (GLOSSARY_DISPLAYS as readonly unknown[]).includes(v);

/** Clave de búsqueda: minúsculas, apóstrofo tipográfico → recto, sin puntuación alrededor. */
export function glossaryKey(word: string): string {
  return word.toLowerCase().replace(/[‘’]/g, "'").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

export interface LineToken {
  /** Texto tal cual (palabra o separador). */
  text: string;
  /** Clave de glosario si es una palabra; null si es espacio o puntuación. */
  key: string | null;
}

/** Parte una línea en palabras (letras, dígitos, apóstrofos y guiones internos) y separadores, sin perder nada. */
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

/** Saca el marcado de inglés modelado de las plantillas (***Corn.***) y llena los huecos que no tienen valor. */
export function plainTemplateText(text: string): string {
  return text.replace(/\*{3}([^*]+)\*{3}/g, "$1").replace(/\{[a-z_0-9]+\}/g, "…");
}
