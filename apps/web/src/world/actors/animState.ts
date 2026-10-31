// world/actors/animState.ts — the characters' animation state machine (plan estetica-c M3). Pure (no three), the
// GPU-free tests exercise it: it picks the base clip by speed (idle, walk, trot; sit if asked), the gesture
// on top by the scene state (the NPC talks: talk; player's turn: listen) or by a requested gesture, how much
// bounce is allowed ("reduce motion" sets it to zero) and whether the mouth shows. Also, who gets animated when there are more
// characters than the tier's cap (distant and off-screen ones stay frozen).
import type { ClipId } from "./clips";

/** Above this (m/s) it walks; above TROT_SPEED it trots. */
export const WALK_SPEED_MIN = 0.15;
/**
 * The core moves the player at 3.5 m/s and has no trot yet: with this threshold walking is what shows.
 * M3 SEAM: when the core has running (or the script asks to hurry), its speed passes this threshold and yields trot.
 */
export const TROT_SPEED = 4.6;
/** Speed (m/s, at world scale) at which KayKit's walk clip steps without sliding; [operator] tunes it. */
export const WALK_CLIP_SPEED = 2.6;
export const TROT_CLIP_SPEED = 5.2;

/** The character's role in the current scene. */
export type SceneRole = "habla" | "escucha" | null;
/** Gestures the dialogue can request (one-shot ones and the sustained ones). */
export type GestureId = Extract<ClipId, "saludar" | "asentir" | "negar" | "pensar" | "sorprenderse" | "cargar" | "dar">;
export type BaseClip = Extract<ClipId, "idle" | "caminar" | "trotar" | "sentarse">;

export interface AnimInput {
  /** m/s. */
  speed: number;
  reduceMotion: boolean;
  scene: SceneRole;
  /** Requested gesture (and still in progress); wins over the scene's. */
  gesture: GestureId | null;
  seated?: boolean;
}

export interface AnimChoice {
  base: BaseClip;
  /** Playback speed of the base clip (so the stride matches the movement). */
  rate: number;
  overlay: GestureId | "hablar" | "escuchar" | null;
  /** 1 = the stride and breathing bounce; 0 with "reduce motion" (the hip stays at its height). */
  bounce: number;
  /** The mouth appears only when talking (proposal C §3). */
  mouth: boolean;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function baseFor(speed: number, seated = false): BaseClip {
  if (speed >= TROT_SPEED) return "trotar";
  if (speed > WALK_SPEED_MIN) return "caminar";
  return seated ? "sentarse" : "idle";
}

export function chooseAnimation(i: AnimInput): AnimChoice {
  const base = baseFor(i.speed, i.seated);
  const rate = base === "caminar" ? clamp(i.speed / WALK_CLIP_SPEED, 0.6, 1.8) : base === "trotar" ? clamp(i.speed / TROT_CLIP_SPEED, 0.7, 1.6) : 1;
  const moving = base === "caminar" || base === "trotar";
  // Talking and listening belong to whoever stands still in the chat; a requested gesture still happens while walking (waving in passing).
  const sceneOverlay = moving ? null : i.scene === "habla" ? "hablar" : i.scene === "escucha" ? "escuchar" : null;
  return { base, rate, overlay: i.gesture ?? sceneOverlay, bounce: i.reduceMotion ? 0 : 1, mouth: i.scene === "habla" };
}

export interface AnimCandidate {
  id: string;
  /** Distance to the camera (m). */
  distance: number;
  onScreen: boolean;
}

/**
 * The ids animated this frame: only those on screen, closest first, up to `max`
 * (the tier's `maxAnimatedCharacters`). The rest stay frozen in their last pose. Ties broken by id (stable). With `only`
 * (plan estetica-c M6, 03 §2.7.4: during the chat) only those ids may animate (the player and the scene's NPC);
 * background ones stay still.
 */
export function pickAnimated(entries: readonly AnimCandidate[], max: number, only: ReadonlySet<string> | null = null): Set<string> {
  const visible = entries.filter((e) => e.onScreen && (only === null || only.has(e.id))).sort((a, b) => a.distance - b.distance || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return new Set(visible.slice(0, Math.max(0, max)).map((e) => e.id));
}

/**
 * The `only` filter of pickAnimated for the frame (plan estetica-c M6, 03 §2.7.4): outside the chat null (all
 * compete for the tier's cap); during the chat, only the ids present (the player and the scene's NPC).
 */
export function sceneAnimated(inScene: boolean, ids: readonly (string | null)[]): ReadonlySet<string> | null {
  if (!inScene) return null;
  return new Set(ids.filter((id): id is string => id !== null));
}
