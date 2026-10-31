// Pure PCM conversions (F5.2, D-094): float [-1, 1] ↔ little-endian mono PCM16, the binary framing of the scene
// WebSocket (ADR-017). No DOM or Web Audio: they run on the main thread, in the worklet and in vitest.

/** Float32 [-1, 1] → PCM16 (clamps out-of-range values). */
export function floatToPcm16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const v = Math.max(-1, Math.min(1, input[i] ?? 0));
    out[i] = v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff);
  }
  return out;
}

/** PCM16 → Float32 [-1, 1). */
export function pcm16ToFloat(input: Int16Array): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = (input[i] ?? 0) / 0x8000;
  return out;
}

/** Bytes of a binary frame (little-endian PCM16) → samples; a trailing stray byte is dropped. */
export function pcm16FromBytes(bytes: ArrayBuffer): Int16Array {
  const view = new DataView(bytes);
  const out = new Int16Array(Math.floor(bytes.byteLength / 2));
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true);
  return out;
}

/** Samples → little-endian PCM16 bytes (its own copy, ready to send). */
export function pcm16ToBytes(pcm: Int16Array): ArrayBuffer {
  const out = new ArrayBuffer(pcm.length * 2);
  const view = new DataView(out);
  for (let i = 0; i < pcm.length; i++) view.setInt16(i * 2, pcm[i] ?? 0, true);
  return out;
}
