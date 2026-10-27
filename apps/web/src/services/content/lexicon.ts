// services/content — léxico del HUD de diálogo (F4.2): `manifiesto.json` (glossaryDisplay, 03 §8.3), el glosario
// curado (D-067) y los textos de las plantillas de Lumi (sus líneas viajan por id). Validación mínima a mano, como el
// catálogo de solo-diálogo: una forma inesperada falla claro y el HUD sigue sin glosario (nunca inventa traducciones).
import type { Lexicon, GlossaryEntryInfo } from "../../state/slices";
import { browserFetchJson, ContentShapeError, type FetchJson } from "./dialogOnlyCatalog";
import { universeContentBase } from "./universe";

export const LEXICON_FILES = { manifest: "manifiesto.json", glossary: "glosario.json", lumi: "lumi.json" } as const;
const LOCALE = "es-AR";
const STATES = ["draft", "reviewed", "approved"] as const;
const DISPLAYS = ["dev", "release", "fv"] as const;

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseLexicon(manifest: unknown, glossary: unknown, lumi: unknown): Omit<Lexicon, "status"> {
  const display = isObj(manifest) ? manifest.glossaryDisplay : undefined;
  if (!(DISPLAYS as readonly unknown[]).includes(display)) throw new ContentShapeError(LEXICON_FILES.manifest, "falta glossaryDisplay (dev | release | fv)");
  if (!Array.isArray(glossary)) throw new ContentShapeError(LEXICON_FILES.glossary, "se esperaba una lista");
  if (!Array.isArray(lumi)) throw new ContentShapeError(LEXICON_FILES.lumi, "se esperaba una lista");
  const entries: GlossaryEntryInfo[] = glossary.filter(isObj).flatMap((g) => {
    const tr = isObj(g.traducciones) ? g.traducciones[LOCALE] : undefined;
    if (typeof g.id !== "string" || typeof g.en !== "string" || !isObj(tr) || typeof tr.texto !== "string") return [];
    if (!(STATES as readonly unknown[]).includes(g.estado)) return [];
    return [{
      id: g.id, en: g.en, enPlural: typeof g.en_plural === "string" ? g.en_plural : null, es: tr.texto,
      notes: typeof tr.notas === "string" ? tr.notas : null, state: g.estado as GlossaryEntryInfo["state"],
    }];
  });
  const texts: Record<string, string> = {};
  for (const p of lumi.filter(isObj)) {
    const texto = isObj(p.texto) ? p.texto[LOCALE] : p.texto;
    if (typeof p.id === "string" && typeof texto === "string") texts[p.id] = texto;
  }
  return { glossaryDisplay: display as Lexicon["glossaryDisplay"], glossary: entries, lumi: texts };
}

export interface LexiconSink {
  lexiconLoading(): void;
  lexiconLoaded(lexicon: Omit<Lexicon, "status">): void;
  lexiconFailed(): void;
}

/** `universeId` (D-814): sin él (o U-CAMPESINO) las URLs son las legacy de siempre. */
export async function loadLexicon(sink: LexiconSink, baseUrl: string, fetchJson: FetchJson = browserFetchJson, universeId?: string): Promise<boolean> {
  sink.lexiconLoading();
  const base = universeContentBase(baseUrl, universeId);
  try {
    const [manifest, glossary, lumi] = await Promise.all([
      fetchJson(`${base}${LEXICON_FILES.manifest}`),
      fetchJson(`${base}${LEXICON_FILES.glossary}`),
      fetchJson(`${base}${LEXICON_FILES.lumi}`),
    ]);
    sink.lexiconLoaded(parseLexicon(manifest, glossary, lumi));
    return true;
  } catch (err) {
    console.warn("[content] no se pudo cargar el glosario del HUD:", err instanceof Error ? err.message : err);
    sink.lexiconFailed();
    return false;
  }
}
