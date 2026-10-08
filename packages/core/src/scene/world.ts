// Efectos de misión sobre el mundo y orden de escenas (03 §6.4.8, D-168, D-169, D-194). Puro: el servidor decide qué
// efectos emite al cerrar una escena y el cliente los aplica con la misma función. Las formas son estructurales (el
// núcleo no depende de @lg/content-schema, 03 §4.3): calzan con las misiones y NPCs compilados.

export type FoundationStage = "idea" | "en_marcha" | "fundado" | "crece";
const STAGE_ORDER: readonly FoundationStage[] = ["idea", "en_marcha", "fundado", "crece"];

export type WorldEffect =
  | { readonly fundacion: string; readonly estado: FoundationStage }
  | { readonly intro: string }
  | { readonly flag: string };

export interface WorldProgress {
  readonly flags: Readonly<Record<string, boolean>>;
  readonly foundations: Readonly<Record<string, FoundationStage>>;
  /** NPCs presentados: `intro:<NPC>` consumado (D-168). */
  readonly intros: readonly string[];
}

export const emptyWorldProgress = (): WorldProgress => ({ flags: {}, foundations: {}, intros: [] });

const effectKey = (e: WorldEffect): string =>
  "flag" in e ? `flag:${e.flag}` : "intro" in e ? `intro:${e.intro}` : `fundacion:${e.fundacion}:${e.estado}`;

/** Quita repetidos conservando el primer orden. */
export const dedupeEffects = (effects: readonly WorldEffect[]): WorldEffect[] => {
  const seen = new Set<string>();
  return effects.filter((e) => {
    const key = effectKey(e);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * Aplica efectos al mundo (inmutable). Una fundación nunca retrocede (idea → en_marcha → fundado → crece, 02 §1.8);
 * un intro o un flag repetido no cambia nada. Sin cambios devuelve el mismo objeto.
 */
export function applyWorldEffects(world: WorldProgress, effects: readonly WorldEffect[]): WorldProgress {
  let flags = world.flags;
  let foundations = world.foundations;
  let intros = world.intros;
  for (const e of effects) {
    if ("flag" in e) {
      if (flags[e.flag] !== true) flags = { ...flags, [e.flag]: true };
    } else if ("intro" in e) {
      if (!intros.includes(e.intro)) intros = [...intros, e.intro];
    } else {
      const current = foundations[e.fundacion];
      if (current === undefined || STAGE_ORDER.indexOf(e.estado) > STAGE_ORDER.indexOf(current)) {
        foundations = { ...foundations, [e.fundacion]: e.estado };
      }
    }
  }
  return flags === world.flags && foundations === world.foundations && intros === world.intros ? world : { flags, foundations, intros };
}

// ---------- misiones y escenas ----------

export interface SceneLike {
  readonly escena_id: string;
  readonly npc: string | null;
  readonly efectos: readonly WorldEffect[];
  readonly criterios_exito: readonly { readonly id: string; readonly opcional?: boolean | undefined }[];
}

export interface MissionLike {
  readonly id: string;
  /** Misiones previas (`M0.1`) o presentaciones (`intro:NPC-X`). */
  readonly requiere: readonly string[];
  readonly efectos: readonly WorldEffect[];
  readonly red?: { readonly nombra: readonly string[]; readonly presenta: readonly { readonly npc: string }[] } | undefined;
  readonly escenas: readonly SceneLike[];
}

export interface NpcLike {
  readonly id: string;
  readonly requiere_presentacion: boolean;
}

export interface StoryProgress {
  readonly completedMissions: readonly string[];
  readonly completedScenes: readonly string[];
  readonly intros: readonly string[];
}

export const emptyStoryProgress = (): StoryProgress => ({ completedMissions: [], completedScenes: [], intros: [] });

const INTRO_PREFIX = "intro:";

/** Un requisito de misión: `M0.1` (misión cumplida) o `intro:NPC-X` (presentación consumada). */
export const requirementMet = (req: string, progress: StoryProgress): boolean =>
  req.startsWith(INTRO_PREFIX) ? progress.intros.includes(req.slice(INTRO_PREFIX.length)) : progress.completedMissions.includes(req);

export type SceneResolution =
  | { readonly kind: "scene"; readonly missionId: string; readonly sceneId: string }
  /** El NPC pide presentación y nadie lo presentó: saluda con su línea guionada y no abre la misión (02 §1.7). */
  | { readonly kind: "notIntroduced"; readonly npcId: string }
  | { readonly kind: "none" };

/**
 * Qué escena abre hablar con `npc` (o, con `null`, la escena sin NPC del compañero, como M0.2). Las misiones se
 * recorren en el orden del contenido; una misión está disponible cuando no se cumplió y sus `requiere` sí. Así el
 * prólogo corre M0.1 → M0.2 → M0.3 por sus propios requisitos.
 */
export function resolveScene(missions: readonly MissionLike[], npc: NpcLike | null, progress: StoryProgress): SceneResolution {
  if (npc && npc.requiere_presentacion && !progress.intros.includes(npc.id)) return { kind: "notIntroduced", npcId: npc.id };
  const npcId = npc?.id ?? null;
  for (const m of missions) {
    if (progress.completedMissions.includes(m.id) || !m.requiere.every((r) => requirementMet(r, progress))) continue;
    const scene = m.escenas.find((e) => !progress.completedScenes.includes(e.escena_id));
    if (scene && scene.npc === npcId) return { kind: "scene", missionId: m.id, sceneId: scene.escena_id };
  }
  return { kind: "none" };
}

/** ¿Cerrar esta escena cierra la misión? (es la última escena que faltaba) */
export const closesMission = (mission: MissionLike, sceneId: string, progress: StoryProgress): boolean =>
  mission.escenas.every((e) => e.escena_id === sceneId || progress.completedScenes.includes(e.escena_id));

/**
 * Efectos que emite el cierre de una escena (03 §6.4.8): los de la escena y, si cierra la misión, los de la misión más
 * las presentaciones de su bloque `red` (`presenta` y `nombra`: quien te nombra a un vecino te lo presenta).
 */
export function sceneCloseEffects(mission: MissionLike, sceneId: string, progress: StoryProgress): WorldEffect[] {
  const scene = mission.escenas.find((e) => e.escena_id === sceneId);
  if (!scene) return [];
  if (!closesMission(mission, sceneId, progress)) return dedupeEffects(scene.efectos);
  const red: WorldEffect[] = [
    ...(mission.red?.presenta ?? []).map((p) => ({ intro: p.npc })),
    ...(mission.red?.nombra ?? []).map((npc) => ({ intro: npc })),
  ];
  return dedupeEffects([...scene.efectos, ...mission.efectos, ...red]);
}

/** Progreso tras cerrar la escena (y quizás la misión), con las presentaciones de los efectos. */
export function advanceStory(progress: StoryProgress, mission: MissionLike, sceneId: string,
  effects: readonly WorldEffect[]): StoryProgress {
  const completedScenes = progress.completedScenes.includes(sceneId) ? progress.completedScenes : [...progress.completedScenes, sceneId];
  const completedMissions = closesMission(mission, sceneId, progress) && !progress.completedMissions.includes(mission.id)
    ? [...progress.completedMissions, mission.id] : progress.completedMissions;
  const intros = applyWorldEffects({ flags: {}, foundations: {}, intros: progress.intros }, effects).intros;
  return { completedMissions, completedScenes, intros };
}
