// world/actors/animState.ts — la máquina de animación de los personajes (plan estetica-c M3). Pura (sin three), la
// testean los tests sin GPU: elige el clip de base por velocidad (idle, caminar, trotar; sentarse si lo piden), el gesto
// encima por el estado de la escena (el NPC habla: hablar; turno del jugador: escuchar) o por un gesto pedido, cuánto
// rebote se permite ("reducir movimiento" lo baja a cero) y si se ve la boca. Además, a quién se anima cuando hay más
// personajes que el tope del tier (los lejanos y los fuera de pantalla quedan congelados).
import type { ClipId } from "./clips";

/** Por encima de esto (m/s) camina; por encima de TROT_SPEED trota. */
export const WALK_SPEED_MIN = 0.15;
/**
 * El núcleo mueve al jugador a 3,5 m/s y todavía no tiene trote: con esta marca caminar es lo que se ve.
 * M3 SEAM: cuando el núcleo tenga correr (o el guion pida apurarse), su velocidad pasa este umbral y da trotar.
 */
export const TROT_SPEED = 4.6;
/** Velocidad (m/s, a escala del mundo) a la que el clip de caminar de KayKit pisa sin patinar; [operador] la ajusta. */
export const WALK_CLIP_SPEED = 2.6;
export const TROT_CLIP_SPEED = 5.2;

/** El papel del personaje en la escena en curso. */
export type SceneRole = "habla" | "escucha" | null;
/** Gestos que el diálogo puede pedir (los de una vez y los que duran). */
export type GestureId = Extract<ClipId, "saludar" | "asentir" | "negar" | "pensar" | "sorprenderse" | "cargar" | "dar">;
export type BaseClip = Extract<ClipId, "idle" | "caminar" | "trotar" | "sentarse">;

export interface AnimInput {
  /** m/s. */
  speed: number;
  reduceMotion: boolean;
  scene: SceneRole;
  /** Gesto pedido (y todavía en curso); gana sobre el de la escena. */
  gesture: GestureId | null;
  seated?: boolean;
}

export interface AnimChoice {
  base: BaseClip;
  /** Velocidad de reproducción del clip de base (para que el paso acompañe al desplazamiento). */
  rate: number;
  overlay: GestureId | "hablar" | "escuchar" | null;
  /** 1 = el rebote del paso y de la respiración; 0 con "reducir movimiento" (la cadera queda a su altura). */
  bounce: number;
  /** La boca aparece solo al hablar (propuesta C §3). */
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
  // Hablar y escuchar son de quien está quieto en la charla; un gesto pedido se hace igual caminando (saludar al pasar).
  const sceneOverlay = moving ? null : i.scene === "habla" ? "hablar" : i.scene === "escucha" ? "escuchar" : null;
  return { base, rate, overlay: i.gesture ?? sceneOverlay, bounce: i.reduceMotion ? 0 : 1, mouth: i.scene === "habla" };
}

export interface AnimCandidate {
  id: string;
  /** Distancia a la cámara (m). */
  distance: number;
  onScreen: boolean;
}

/**
 * Los ids que se animan este cuadro: solo los que están en pantalla, los más cercanos primero, hasta `max`
 * (`maxAnimatedCharacters` del tier). El resto queda congelado en su última pose. Empates por id (estable).
 */
export function pickAnimated(entries: readonly AnimCandidate[], max: number): Set<string> {
  const visible = entries.filter((e) => e.onScreen).sort((a, b) => a.distance - b.distance || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return new Set(visible.slice(0, Math.max(0, max)).map((e) => e.id));
}
