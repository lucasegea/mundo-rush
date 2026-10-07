import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { PITCH_OPTIONS, type CameraPreset } from "../lib/camera";
import { classifyWeights, computeFrameStats, formatBytes, loadTimeSeconds, type WeightEntry } from "../lib/metrics";
import { runtime, TIERS, type Settings, type Tier } from "./runtime";

interface Snapshot {
  fps: number;
  p95Ms: number;
  samples: number;
  loadS: number | null;
  drawCalls: number;
  triangles: number;
  weights: ReturnType<typeof classifyWeights>;
}

function loadedResources(): WeightEntry[] {
  const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  return entries.map((e) => ({ name: e.name, bytes: e.encodedBodySize || e.transferSize || 0 }));
}

function snapshot(): Snapshot {
  const stats = computeFrameStats(runtime.sampler.values());
  const generated = Object.values(runtime.generatedTextures).reduce((a, b) => a + b, 0);
  return {
    fps: stats.fps,
    p95Ms: stats.p95Ms,
    samples: stats.samples,
    loadS: loadTimeSeconds(runtime.firstFrameAtMs),
    drawCalls: runtime.drawCalls,
    triangles: runtime.triangles,
    weights: classifyWeights(loadedResources(), generated),
  };
}

const panel: CSSProperties = {
  position: "absolute",
  top: 8,
  left: 8,
  padding: "8px 10px",
  background: "rgba(10,14,20,0.82)",
  color: "#e8eef5",
  font: "12px/1.45 ui-monospace, Consolas, monospace",
  borderRadius: 4,
  minWidth: 250,
  userSelect: "none",
};

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
    <span style={{ opacity: 0.7 }}>{label}</span>
    <span>{children}</span>
  </div>
);

interface Props {
  settings: Settings;
  dpr: number;
  onChange: (patch: Partial<Settings>) => void;
}

/** DOM overlay (outside the canvas): metrics polled twice a second, selectors for the operator. */
export function Overlay({ settings, dpr, onChange }: Props) {
  const [s, setS] = useState<Snapshot>(snapshot);
  useEffect(() => {
    const id = window.setInterval(() => setS(snapshot()), 500);
    return () => window.clearInterval(id);
  }, []);

  const fpsColor = s.fps === 0 ? "#aaa" : s.fps >= 55 ? "#7ee08a" : s.fps >= 30 ? "#f2d36b" : "#ff7b6b";

  return (
    <div style={panel}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>F0.2 HD-2D spike</div>
      <Row label="FPS">
        <span style={{ color: fpsColor }}>{s.fps.toFixed(1)}</span>
      </Row>
      <Row label="frame p95">{s.p95Ms.toFixed(1)} ms</Row>
      <Row label="samples">{s.samples}</Row>
      <Row label="load (1st frame)">{s.loadS === null ? "…" : `${s.loadS.toFixed(2)} s`}</Row>
      <Row label="draw calls / tris">
        {s.drawCalls} / {s.triangles}
      </Row>
      <Row label="DPR / view">
        {dpr.toFixed(2)} / {runtime.viewWidthM.toFixed(2)} m
      </Row>
      <Row label="JS (loaded)">{formatBytes(s.weights.jsBytes)}</Row>
      <Row label="textures (GPU, code)">{formatBytes(s.weights.textureBytes)}</Row>
      <Row label="GLB">{formatBytes(s.weights.glbBytes)}</Row>
      <Row label="total">{formatBytes(s.weights.totalBytes)}</Row>
      <Row label="perf monitor">
        {runtime.perf.last} ({runtime.perf.declines}↓ {runtime.perf.inclines}↑)
      </Row>
      {import.meta.env.DEV && <div style={{ opacity: 0.6, marginTop: 2 }}>dev: JS unbundled; weigh with build + preview</div>}

      <hr style={{ borderColor: "#334", margin: "6px 0" }} />
      <label style={{ display: "flex", justifyContent: "space-between" }}>
        tier
        <select value={settings.tier} onChange={(e) => onChange({ tier: e.target.value as Tier })}>
          {TIERS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label style={{ display: "flex", justifyContent: "space-between" }}>
        camera
        <select value={settings.preset} onChange={(e) => onChange({ preset: e.target.value as CameraPreset })}>
          <option value="topdownOrtho">topdownOrtho</option>
          <option value="isoOrtho">isoOrtho (yaw 45)</option>
        </select>
      </label>
      <label style={{ display: "flex", justifyContent: "space-between" }}>
        pitch {settings.preset === "isoOrtho" ? "(topdown only)" : ""}
        <select value={settings.pitch} onChange={(e) => onChange({ pitch: Number(e.target.value) })}>
          {PITCH_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}°
            </option>
          ))}
        </select>
      </label>
      {(
        [
          ["shadows", "shadows (map 1024)"],
          ["pixelSnap", "pixel snap"],
          ["integerScale", "integer pixel scale"],
          ["autoTier", "auto tier (monitor)"],
          ["spriteCompensation", "sprite height 1/cos(pitch)"],
        ] as const
      ).map(([key, label]) => (
        <label key={key} style={{ display: "flex", justifyContent: "space-between" }}>
          {label}
          <input type="checkbox" checked={settings[key]} onChange={(e) => onChange({ [key]: e.target.checked })} />
        </label>
      ))}
    </div>
  );
}
