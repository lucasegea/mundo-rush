// Remuestreo puro (F5.2): la captura corre a la tasa del AudioContext (44,1 o 48 kHz) y Live acepta 16 kHz (03 §5.5).
// Bajar: promedio por ventana (un pasabajos simple que evita el aliasing más grueso). Subir: interpolación lineal.
// El largo de salida es floor(n · to / from): con bloques de 40 ms queda entero para las tasas comunes.

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
        // Peso de la muestra j dentro de [start, end): las de los bordes cuentan en parte.
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
