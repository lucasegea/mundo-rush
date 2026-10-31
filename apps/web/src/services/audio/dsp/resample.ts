// Pure resampling (F5.2): capture runs at the AudioContext rate (44.1 or 48 kHz) and Live accepts 16 kHz (03 §5.5).
// Downsampling: window average (a simple low-pass that avoids the worst aliasing). Upsampling: linear interpolation.
// The output length is floor(n · to / from): with 40 ms blocks it comes out as an integer for the common rates.

export function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (!(fromRate > 0) || !(toRate > 0)) throw new RangeError("resample: tasas inválidas");
  if (fromRate === toRate) return input.slice();
  const outLen = Math.floor((input.length * toRate) / fromRate);
  const out = new Float32Array(outLen);
  const ratio = fromRate / toRate;
  if (ratio > 1) {
    for (let i = 0; i < outLen; i++) {
      const start = i * ratio;
      const end = Math.min(input.length, start + ratio);
      let sum = 0;
      let weight = 0;
      for (let j = Math.floor(start); j < end; j++) {
        // Weight of sample j within [start, end): the ones at the edges count partially.
        const w = Math.min(j + 1, end) - Math.max(j, start);
        sum += (input[j] ?? 0) * w;
        weight += w;
      }
      out[i] = weight > 0 ? sum / weight : 0;
    }
    return out;
  }
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const j = Math.floor(pos);
    const frac = pos - j;
    const a = input[j] ?? 0;
    const b = input[Math.min(j + 1, input.length - 1)] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}
