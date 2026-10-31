// Mission effects on the world and scene order (03 §6.4.8, D-168, D-169, D-194). Pure: the server decides which
// effects it emits when closing a scene and the client applies them with the same function. The shapes are structural (the
// core does not depend on @lg/content-schema, 03 §4.3): they match the compiled missions and NPCs.

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

/** Removes duplicates keeping the first order. */
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
 * Applies effects to the world (immutable). A foundation never goes backward (idea → en_marcha → fundado → crece, 02 §1.8);
 * a repeated intro or flag changes nothing. Without changes it returns the same object.
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

// ---------- missions and scenes ----------

export interface SceneLike {
  readonly escena_id: string;
  readonly npc: string | null;
  readonly efectos: readonly WorldEffect[];
  readonly criterios_exito: readonly { readonly id: string; readonly opcional?: boolean | undefined }[];
}

export interface MissionLike {
  readonly id: string;
  /** Previous missions (`M0.1`) or introductions (`intro:NPC-X`). */
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

/** A mission requirement: `M0.1` (mission completed) or `intro:NPC-X` (introduction done). */
export const requirementMet = (req: string, progress: StoryProgress): boolean =>
  req.startsWith(INTRO_PREFIX) ? progress.intros.includes(req.slice(INTRO_PREFIX.length)) : progress.completedMissions.includes(req);

export type SceneResolution =
  | { readonly kind: "scene"; readonly missionId: string; readonly sceneId: string }
  /** The NPC asks for an introduction and nobody introduced them: it greets with its scripted line and does not open the mission (02 §1.7). */
  | { readonly kind: "notIntroduced"; readonly npcId: string }
  | { readonly kind: "none" };

/**
 * Which scene talking to `npc` opens (or, with `null`, the companion's scene without an NPC, like M0.2). Missions are
 * walked in content order; a mission is available when it is not completed and its `requiere` are. That way the
 * prologue runs M0.1 → M0.2 → M0.3 by its own requirements.
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

/** Does closing this scene close the mission? (it is the last scene that was missing) */
export const closesMission = (mission: MissionLike, sceneId: string, progress: StoryProgress): boolean =>
  mission.escenas.every((e) => e.escena_id === sceneId || progress.completedScenes.includes(e.escena_id));

/**
 * Effects emitted by closing a scene (03 §6.4.8): those of the scene and, if it closes the mission, those of the mission plus
 * the introductions of its `red` block (`presenta` and `nombra`: whoever names a neighbor to you introduces them to you).
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

/** Progress after closing the scene (and maybe the mission), with the introductions from the effects. */
export function advanceStory(progress: StoryProgress, mission: MissionLike, sceneId: string,
  effects: readonly WorldEffect[]): StoryProgress {
  const completedScenes = progress.completedScenes.includes(sceneId) ? progress.completedScenes : [...progress.completedScenes, sceneId];
  const completedMissions = closesMission(mission, sceneId, progress) && !progress.completedMissions.includes(mission.id)
    ? [...progress.completedMissions, mission.id] : progress.completedMissions;
  const intros = applyWorldEffects({ flags: {}, foundations: {}, intros: progress.intros }, effects).intros;
  return { completedMissions, completedScenes, intros };
}
