export interface FrameStats {
  readonly fps: number;
  readonly avgMs: number;
  readonly p95Ms: number;
  readonly samples: number;
}

/** FPS from the mean frame time, p95 by nearest rank. Empty input gives zeros. */
export function computeFrameStats(frameTimesMs: readonly number[]): FrameStats {
  const valid = frameTimesMs.filter((t) => Number.isFinite(t) && t > 0);
  if (valid.length === 0) return { fps: 0, avgMs: 0, p95Ms: 0, samples: 0 };
  const avgMs = valid.reduce((a, b) => a + b, 0) / valid.length;
  const sorted = [...valid].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(0.95 * sorted.length));
  return { fps: 1000 / avgMs, avgMs, p95Ms: sorted[rank - 1] ?? 0, samples: valid.length };
}

/** Fixed-size ring of the last N frame times (no allocation per frame). */
export class FrameSampler {
  private readonly buf: Float64Array;
  private next = 0;
  private filled = 0;
  constructor(readonly capacity = 240) {
    this.buf = new Float64Array(capacity);
  }
  push(ms: number): void {
    this.buf[this.next] = ms;
    this.next = (this.next + 1) % this.capacity;
    this.filled = Math.min(this.filled + 1, this.capacity);
  }
  values(): number[] {
    return Array.from(this.buf.subarray(0, this.filled));
  }
  reset(): void {
    this.next = 0;
    this.filled = 0;
  }
}

/** Load time = first rendered frame with the scene mounted, from navigation start (ms in, s out). */
export function loadTimeSeconds(firstFrameAtMs: number | null, navigationStartMs = 0): number | null {
  if (firstFrameAtMs === null) return null;
  return Math.max(0, firstFrameAtMs - navigationStartMs) / 1000;
}

export interface WeightEntry {
  readonly name: string;
  readonly bytes: number;
}
export interface Weights {
  readonly jsBytes: number;
  readonly textureBytes: number;
  readonly glbBytes: number;
  readonly totalBytes: number;
}

/** Classifies resources by extension: js/css -> JS, images -> textures, glb/gltf -> GLB; the rest only counts in total. */
export function classifyWeights(entries: readonly WeightEntry[], generatedTextureBytes = 0): Weights {
  let jsBytes = 0;
  let textureBytes = generatedTextureBytes;
  let glbBytes = 0;
  let other = 0;
  for (const e of entries) {
    const path = (e.name.split(/[?#]/)[0] ?? "").toLowerCase();
    if (/\.(m?js|tsx?|jsx|css)$/.test(path)) jsBytes += e.bytes;
    else if (/\.(png|jpe?g|webp|avif|ktx2|basis)$/.test(path)) textureBytes += e.bytes;
    else if (/\.(glb|gltf)$/.test(path)) glbBytes += e.bytes;
    else other += e.bytes;
  }
  return { jsBytes, textureBytes, glbBytes, totalBytes: jsBytes + textureBytes + glbBytes + other };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
