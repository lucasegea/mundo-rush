// Evaluation of success criteria over the observer's results (03 §5.7, F4.1). Deterministic rules:
// only ids that exist in the scene count (the observer never invents a criterion), a "met" criterion needs
// a quote from the player, and what has been met is not lost (nonConverging never removes progress, invariant d).

export interface CriterionDef {
  readonly id: string;
  /** Optional ones are not needed to close successfully. */
  readonly optional: boolean;
}

export interface CriterionReport {
  readonly criterionId: string;
  readonly met: boolean;
  readonly quote: string;
}

export interface CriteriaState {
  /** criterion → player quote that met it. */
  readonly met: Readonly<Record<string, string>>;
}

export const emptyCriteria = (): CriteriaState => ({ met: {} });

export interface CriteriaUpdate {
  readonly state: CriteriaState;
  /** Criteria that became met with this report. */
  readonly newlyMet: readonly string[];
  /** Ids that do not exist in the scene: they are discarded (criteria are never invented). */
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

/** All mandatory criteria met (a scene without mandatory criteria is never considered met on its own). */
export function criteriaSatisfied(defs: readonly CriterionDef[], state: CriteriaState): boolean {
  const required = defs.filter((d) => !d.optional);
  return required.length > 0 && required.every((d) => d.id in state.met);
}

export const metCriteriaIds = (defs: readonly CriterionDef[], state: CriteriaState): string[] =>
  defs.map((d) => d.id).filter((id) => id in state.met);
