import { Canvas } from "@react-three/fiber";
import { useCallback, useState } from "react";
import { CameraRig } from "./scene/CameraRig";
import { FrameProbe } from "./scene/FrameProbe";
import { Lighting } from "./scene/Lighting";
import { Overlay } from "./scene/Overlay";
import { Post } from "./scene/Post";
import { DEFAULT_SETTINGS, runtime, TIER_DPR, TIERS, type Settings } from "./scene/runtime";
import { Tiles } from "./scene/Tiles";
import { Volumes } from "./scene/Volumes";
import { Walkers } from "./scene/Walkers";

export function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  const update = useCallback((patch: Partial<Settings>) => {
    runtime.sampler.reset();
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  // Only acts when the operator enabled "auto": steps one tier down on a PerformanceMonitor decline.
  const onDecline = useCallback(() => {
    setSettings((s) => {
      const i = TIERS.indexOf(s.tier);
      if (!s.autoTier || i <= 0) return s;
      runtime.sampler.reset();
      return { ...s, tier: TIERS[i - 1]! };
    });
  }, []);

  const dpr = Math.min(window.devicePixelRatio || 1, TIER_DPR[settings.tier]);

  return (
    <>
      <Canvas
        flat
        shadows
        dpr={dpr}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        style={{ position: "absolute", inset: 0, imageRendering: "pixelated" }}
      >
        <color attach="background" args={["#9cc7e4"]} />
        <CameraRig preset={settings.preset} pitch={settings.pitch} pixelSnap={settings.pixelSnap} integerScale={settings.integerScale} />
        <Lighting shadows={settings.shadows} />
        <Tiles />
        <Volumes />
        <Walkers compensateHeight={settings.spriteCompensation} />
        <Post tier={settings.tier} />
        <FrameProbe onDecline={onDecline} />
      </Canvas>
      <Overlay settings={settings} dpr={dpr} onChange={update} />
    </>
  );
}
