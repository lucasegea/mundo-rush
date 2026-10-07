// RNG con semilla (R4): el núcleo nunca llama Math.random(). Misma semilla, misma
// secuencia, en cualquier máquina (aritmética de 32 bits con Math.imul). Algoritmo:
// mulberry32 (estado de 32 bits); las semillas de texto se reducen con FNV-1a.
// No es criptográfico: sirve para reglas de juego reproducibles, no para secretos.

export interface Rng {
  /** Flotante uniforme en [0, 1). */
  next(): number;
  /** Entero uniforme en [min, max], ambos incluidos. */
  int(min: number, max: number): number;
  /** Un elemento uniforme de una lista no vacía. */
  pick<T>(items: readonly T[]): T;
  /** Estado actual (32 bits sin signo): con createRngFromState se retoma la secuencia. */
  state(): number;
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Reduce una semilla (número entero o texto) a 32 bits sin signo. */
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

/** Crea un RNG desde una semilla. */
export function createRng(seed: number | string): Rng {
  return createRngFromState(seedToState(seed));
}

/** Retoma un RNG desde un estado guardado con `state()`. */
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
    // El rango cabe en 32 bits: más ancho, next() no tiene resolución para ser uniforme.
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
