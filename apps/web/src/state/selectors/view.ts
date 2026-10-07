// Selectores de vista memorizados (R14). Un view-model se recalcula solo si cambió alguna de sus entradas
// (por identidad), así el hook de React recibe el mismo objeto mientras nada relevante cambie.
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
