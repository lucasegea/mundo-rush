// world/materials/rng.ts — small deterministic generator (mulberry32) for code-built art: same seed, same
// drawing. The core Rng is for the simulation; this one is presentation-only and is not shared with the game.
export function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
