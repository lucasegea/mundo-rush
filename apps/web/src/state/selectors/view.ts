// Memoized view selectors (R14). A view-model is recomputed only if one of its inputs changed
// (by identity), so the React hook receives the same object while nothing relevant changes.
import type { GameState } from "../store";

export function createViewSelector<I extends readonly unknown[], R>(
  inputs: (s: GameState) => I,
  compute: (...args: [...I]) => R,
): (s: GameState) => R {
  let last: I | null = null;
  let cached: R;
  return (s) => {
    const next = inputs(s);
    if (last !== null && next.length === last.length && next.every((v, i) => Object.is(v, (last as I)[i]))) return cached;
    last = next;
    cached = compute(...(next as unknown as [...I]));
    return cached;
  };
}
