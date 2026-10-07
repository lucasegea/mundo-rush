import { Vector3 } from "three";
import type { CameraPreset } from "../lib/camera";
import { DEFAULT_PITCH } from "../lib/camera";
import { FrameSampler } from "../lib/metrics";

export type Tier = "low" | "medium" | "high";
export const TIERS: readonly Tier[] = ["low", "medium", "high"];
/** DPR cap per tier (03 §2.7.1). */
export const TIER_DPR: Record<Tier, number> = { low: 1, medium: 1.5, high: 2 };

export interface Settings {
  tier: Tier;
  pitch: number;
  preset: CameraPreset;
  shadows: boolean;
  pixelSnap: boolean;
  integerScale: boolean;
  autoTier: boolean;
  spriteCompensation: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  tier: "medium",
  pitch: DEFAULT_PITCH,
  preset: "topdownOrtho",
  shadows: false,
  pixelSnap: true,
  integerScale: false,
  autoTier: false,
  spriteCompensation: true,
};

/**
 * Per-frame data shared between the canvas and the DOM overlay without React re-renders
 * (render discipline: nothing here triggers setState inside useFrame).
 */
export const runtime = {
  sampler: new FrameSampler(240),
  firstFrameAtMs: null as number | null,
  followTarget: new Vector3(23.5, 0, 16),
  drawCalls: 0,
  triangles: 0,
  /** GPU bytes of code-generated textures, keyed by name (idempotent under re-mounts). */
  generatedTextures: {} as Record<string, number>,
  perf: { factor: 0.5, last: "—", declines: 0, inclines: 0 },
  viewWidthM: 15,
};
