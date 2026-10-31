// world/actors/Player.tsx — the player (plan estetica-c M1 item 13; with skeleton since M3). Reads the logical pose (30 Hz) transiently
// and interpolates between the previous step and the current one (R7); a pose jump (the settling at chat start)
// glides from the last drawn position (glide.ts). Publishes the drawn position for the camera and the NPCs. In
// the chat it looks at the NPC; walking, toward where it goes.
import { useRef } from "react";
import type { SceneDensity, WorldLook } from "@lg/art";
import type { ConversationFrame } from "../../state/selectors";
import { readGame, selectPlayerPose } from "../../state/selectors";
import { followTarget } from "../runtime";
import type { SceneRole } from "./animState";
import { Character, type ActorPose } from "./Character";
import { stepGlide, type GlideState } from "./glide";
import { PLAYER_LOOK, PLAYER_LOOK_ID } from "./looks";

/** Fraction [0, 1] of the fixed step that has passed since the tick changed. */
export function interpolationAlpha(elapsedSec: number, stepSec: number): number {
  return stepSec > 0 ? Math.min(1, Math.max(0, elapsedSec / stepSec)) : 1;
}

/** `cast`: the characters of the diorama look (open-world-3d T7b, D-840: the skeleton comes from there, not from the relief). */
export function Player({ conversation, cut, scene = null, lod = "full", cast = null }: { conversation: ConversationFrame | null; cut: boolean; scene?: SceneRole; lod?: SceneDensity; cast?: WorldLook["characters"] | null }) {
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

  return <Character id={PLAYER_LOOK_ID} look={PLAYER_LOOK} pose={pose} cut={cut} scene={scene} initialYaw={Math.PI * 0.25} lod={lod} cast={cast} />;
}
