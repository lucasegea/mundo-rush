// Seeded RNG (R4): the core never calls Math.random(). Same seed, same
// sequence, on any machine (32-bit arithmetic with Math.imul). Algorithm:
// mulberry32 (32-bit state); text seeds are reduced with FNV-1a.
// Not cryptographic: it is for reproducible game rules, not for secrets.

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max], both included. */
  int(min: number, max: number): number;
  /** A uniform element of a non-empty list. */
  pick<T>(items: readonly T[]): T;
  /** Current state (unsigned 32 bits): createRngFromState resumes the sequence. */
  state(): number;
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Reduces a seed (integer or text) to unsigned 32 bits. */
export function seedToState(seed: number | string): number {
  if (typeof seed === "number") {
    if (!Number.isSafeInteger(seed)) throw new RangeError(`semilla inválida: ${seed} (entero seguro)`);
    return seed >>> 0;
  }
  let h = FNV_OFFSET;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

/** Creates an RNG from a seed. */
export function createRng(seed: number | string): Rng {
  return createRngFromState(seedToState(seed));
}

/** Resumes an RNG from a state saved with `state()`. */
export function createRngFromState(initial: number): Rng {
  if (!Number.isInteger(initial) || initial < 0 || initial > 0xffffffff) {
    throw new RangeError(`estado de RNG inválido: ${initial} (entero de 32 bits sin signo)`);
  }
  let s = initial;

  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => {
    // The range fits in 32 bits: any wider, next() does not have the resolution to be uniform.
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max || max - min >= 0x100000000) {
      throw new RangeError(`int: rango inválido [${min}, ${max}]`);
    }
    return min + Math.floor(next() * (max - min + 1));
  };

  return {
    next,
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new RangeError("pick: lista vacía");
      return items[int(0, items.length - 1)] as T;
    },
    state: () => s,
  };
}
