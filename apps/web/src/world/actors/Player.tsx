// world/actors/Player.tsx — el jugador (plan estetica-c M1 ítem 13; con esqueleto desde M3). Lee la pose lógica (30 Hz) de forma
// transitoria e interpola entre el paso anterior y el actual (R7); un salto de la pose (el acomodo al empezar la charla)
// se desliza desde la última posición dibujada (glide.ts). Publica la posición dibujada para la cámara y los NPCs. En
// la charla mira al NPC; caminando, hacia donde va.
import { useRef } from "react";
import type { ConversationFrame } from "../../state/selectors";
import { readGame, selectPlayerPose } from "../../state/selectors";
import { followTarget } from "../runtime";
import type { SceneRole } from "./animState";
import { Character, type ActorPose } from "./Character";
import { stepGlide, type GlideState } from "./glide";
import { PLAYER_LOOK, PLAYER_LOOK_ID } from "./looks";

/** Fracción [0, 1] del paso fijo que ya pasó desde que cambió el tick. */
export function interpolationAlpha(elapsedSec: number, stepSec: number): number {
  return stepSec > 0 ? Math.min(1, Math.max(0, elapsedSec / stepSec)) : 1;
}

export function Player({ conversation, cut, scene = null }: { conversation: ConversationFrame | null; cut: boolean; scene?: SceneRole }) {
  const lastTick = useRef({ tick: -1, at: 0 });
  const glide = useRef<GlideState | null>(null);

  const pose = (dt: number): ActorPose => {
    const p = readGame(selectPlayerPose);
    if (!p) return { x: followTarget.x, z: followTarget.z, speed: 0, yaw: null };
    const now = performance.now() / 1000;
    if (p.tick !== lastTick.current.tick) lastTick.current = { tick: p.tick, at: now };
    const a = interpolationAlpha(now - lastTick.current.at, p.stepSec);
    const logical = { x: p.prevX + (p.x - p.prevX) * a, z: p.prevZ + (p.z - p.prevZ) * a };
    glide.current = glide.current ? stepGlide(glide.current, logical, dt, cut) : { shown: logical, glide: null };
    const { shown } = glide.current;
    followTarget.x = shown.x;
    followTarget.z = shown.z;
    followTarget.ready = true;
    const gliding = glide.current.glide !== null;
    const speed = gliding ? 3 : Math.hypot(p.vx, p.vz);
    const yaw = conversation
      ? Math.atan2(conversation.npc.x - shown.x, conversation.npc.z - shown.z)
      : speed > 0.1 && !gliding ? Math.atan2(p.vx, p.vz) : null;
    return { x: shown.x, z: shown.z, speed, yaw };
  };

  return <Character id={PLAYER_LOOK_ID} look={PLAYER_LOOK} pose={pose} cut={cut} scene={scene} initialYaw={Math.PI * 0.25} />;
}
