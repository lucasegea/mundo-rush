// world/actors/Player.tsx — el jugador como billboard. Lee la pose lógica (30 Hz) de forma transitoria e interpola
// entre el paso anterior y el actual (R7); publica la posición interpolada para que la cámara la siga.
import { useMemo, useRef } from "react";
import { readGame, selectPlayerPose } from "../../state/selectors";
import { followTarget } from "../runtime";
import { Billboard, type SpritePose } from "../sprites/Billboard";
import { drawSpriteSheet, PLAYER_PALETTE } from "../sprites/sheet";

const STILL: SpritePose = { x: 0, z: 0, vx: 0, vz: 0 };

/** Fracción [0, 1] del paso fijo que ya pasó desde que cambió el tick. */
export function interpolationAlpha(elapsedSec: number, stepSec: number): number {
  return stepSec > 0 ? Math.min(1, Math.max(0, elapsedSec / stepSec)) : 1;
}

export function Player({ pitchDeg, yawDeg }: { pitchDeg: number; yawDeg: number }) {
  const sheet = useMemo(() => drawSpriteSheet(PLAYER_PALETTE), []);
  const lastTick = useRef({ tick: -1, at: 0 });

  const pose = (): SpritePose => {
    const p = readGame(selectPlayerPose);
    if (!p) return STILL;
    const now = performance.now() / 1000;
    if (p.tick !== lastTick.current.tick) lastTick.current = { tick: p.tick, at: now };
    const a = interpolationAlpha(now - lastTick.current.at, p.stepSec);
    const x = p.prevX + (p.x - p.prevX) * a;
    const z = p.prevZ + (p.z - p.prevZ) * a;
    followTarget.x = x;
    followTarget.z = z;
    followTarget.ready = true;
    return { x, z, vx: p.vx, vz: p.vz };
  };

  return <Billboard sheet={sheet} pitchDeg={pitchDeg} yawDeg={yawDeg} pose={pose} />;
}
