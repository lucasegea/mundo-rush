// selectDirectorSnapshot (03 §6.5.2, FD0 A3): builds the DirectorSnapshot reading ONLY state/selectors/.
// What the store does not keep (the path, who was talked to, the lines of earlier scenes) is accumulated by
// a pure history that advances with each state; the snapshot is state + history, inventing nothing.
import { DIALOGUE_CAP, PATH_CAP, type DirectorSnapshot, type RenderStats } from "@lg/protocol/director";
import {
  selectCurrentDiorama, selectFinalLines, selectFoundations, selectLastPick, selectNearbyIds, selectNetworkIntros,
  selectOpenScene, selectPlayerFacing, selectPlayerPosition, selectPlayerTile, selectRegionName, selectWorldFlags,
  type GameState, type OpenScene,
} from "../../state/selectors";

type Tile = { x: number; y: number };
type Line = DirectorSnapshot["dialogue"][number];

export interface DirectorHistory {
  path: { tile: Tile; at: string }[];
  npcsTalked: string[];
  dialogue: Line[];
  /** Key of the scene whose lines are being followed and how many were already taken. */
  sceneKey: string | null;
  linesSeen: number;
}

export const emptyHistory = (): DirectorHistory => ({ path: [], npcsTalked: [], dialogue: [], sceneKey: null, linesSeen: 0 });

/** A final line of the scene. Until F4 the store does not say who said each line: it is attributed to the scene (NPC). */
export const finalLine = (scene: OpenScene, index: number, text: string): { turnId: string; speaker: string; text: string } => ({
  turnId: `${scene.sceneId ?? scene.npcId ?? "escena"}#${index}`,
  speaker: scene.npcId ?? "desconocido",
  text,
});

const sceneKey = (scene: OpenScene): string => `${scene.sceneId ?? "-"}|${scene.npcId ?? "-"}`;
const sameTile = (a: Tile | undefined, b: Tile): boolean => a !== undefined && a.x === b.x && a.y === b.y;
const keepLast = <T>(list: T[], cap: number): T[] => (list.length > cap ? list.slice(list.length - cap) : list);

/**
 * Advances the history with a new state. Returns the SAME object if nothing changed (so the emitter sees no false
 * changes). `path` keeps only tile changes (≤ 500, the oldest drops out); `dialogue`, the last 20 final lines.
 */
export function advanceHistory(h: DirectorHistory, s: GameState, at: string): DirectorHistory {
  let next = h;
  const edit = (patch: Partial<DirectorHistory>): void => {
    next = { ...next, ...patch };
  };

  const tile = selectPlayerTile(s);
  if (tile && !sameTile(next.path[next.path.length - 1]?.tile, tile)) edit({ path: keepLast([...next.path, { tile, at }], PATH_CAP) });

  const scene = selectOpenScene(s);
  if (scene?.npcId && !next.npcsTalked.includes(scene.npcId)) edit({ npcsTalked: [...next.npcsTalked, scene.npcId] });

  if (scene) {
    const key = sceneKey(scene);
    const seen = key === next.sceneKey ? next.linesSeen : 0;
    const lines = selectFinalLines(s);
    if (key !== next.sceneKey || lines.length !== seen) {
      const fresh: Line[] = lines.slice(seen).map((text, i) => ({ ...finalLine(scene, seen + i, text), at }));
      edit({ sceneKey: key, linesSeen: lines.length, dialogue: keepLast([...next.dialogue, ...fresh], DIALOGUE_CAP) });
    }
  }
  return next;
}

export interface SnapshotMeta {
  sessionId: string;
  at: string;
  /**
   * Plan estetica-c M6: the renderer.info counters (world/budget/renderStats, injected by boot/dev.ts). Without the
   * key, the snapshot does not carry it; with null, the canvas has not drawn yet.
   */
  render?: RenderStats | null;
}

/** The v1 snapshot. `build` and `contentErrors` are filled in by the development plugin (Node knows them, the client does not). */
export function selectDirectorSnapshot(s: GameState, h: DirectorHistory, meta: SnapshotMeta): DirectorSnapshot {
  const scene = selectOpenScene(s);
  return {
    v: 1,
    sessionId: meta.sessionId,
    at: meta.at,
    build: { contentHash: null, gitSha: null },
    region: selectRegionName(s),
    diorama: selectCurrentDiorama(s),
    player: { tile: selectPlayerTile(s), pos: selectPlayerPosition(s), facing: selectPlayerFacing(s) },
    nearby: [...selectNearbyIds(s)],
    scene: scene && { missionId: scene.missionId, sceneId: scene.sceneId, step: scene.step, turnIndex: scene.turnIndex },
    path: h.path,
    npcsTalked: h.npcsTalked,
    dialogue: h.dialogue,
    worldFlags: { ...selectWorldFlags(s) },
    foundations: { ...selectFoundations(s) },
    network: [...selectNetworkIntros(s)],
    lastPick: selectLastPick(s),
    contentErrors: [],
    ...(meta.render !== undefined ? { render: meta.render } : {}),
  };
}
