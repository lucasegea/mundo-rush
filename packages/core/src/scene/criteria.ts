// Evaluación de criterios de éxito sobre los resultados del observador (03 §5.7, F4.1). Reglas determinísticas:
// solo cuentan ids que existen en la escena (el observador nunca inventa un criterio), un criterio "cumplido" necesita
// una cita del jugador, y lo cumplido no se pierde (nonConverging nunca quita progreso, invariante d).

export interface CriterionDef {
  readonly id: string;
  /** Los opcionales no hacen falta para cerrar con éxito. */
  readonly optional: boolean;
}

export interface CriterionReport {
  readonly criterionId: string;
  readonly met: boolean;
  readonly quote: string;
}

export interface CriteriaState {
  /** criterio → cita del jugador que lo cumplió. */
  readonly met: Readonly<Record<string, string>>;
}

export const emptyCriteria = (): CriteriaState => ({ met: {} });

export interface CriteriaUpdate {
  readonly state: CriteriaState;
  /** Criterios que pasaron a cumplidos con este reporte. */
  readonly newlyMet: readonly string[];
  /** Ids que no existen en la escena: se descartan (nunca se inventan criterios). */
  readonly unknown: readonly string[];
}

export function applyCriteriaReports(defs: readonly CriterionDef[], state: CriteriaState,
  reports: readonly CriterionReport[]): CriteriaUpdate {
  const known = new Set(defs.map((d) => d.id));
  const met: Record<string, string> = { ...state.met };
  const newlyMet: string[] = [];
  const unknown: string[] = [];
  for (const r of reports) {
    if (!known.has(r.criterionId)) {
      unknown.push(r.criterionId);
      continue;
    }
    const quote = r.quote.trim();
    if (!r.met || quote === "" || r.criterionId in met) continue;
    met[r.criterionId] = quote;
    newlyMet.push(r.criterionId);
  }
  return { state: newlyMet.length === 0 ? state : { met }, newlyMet, unknown };
}

/** Todos los criterios obligatorios cumplidos (una escena sin criterios obligatorios nunca se da por cumplida sola). */
export function criteriaSatisfied(defs: readonly CriterionDef[], state: CriteriaState): boolean {
  const required = defs.filter((d) => !d.optional);
  return required.length > 0 && required.every((d) => d.id in state.met);
}

export const metCriteriaIds = (defs: readonly CriterionDef[], state: CriteriaState): string[] =>
  defs.map((d) => d.id).filter((id) => id in state.met);
