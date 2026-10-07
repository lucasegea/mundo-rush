// selectDirectorSnapshot (03 §6.5.2, FD0 A3): arma el DirectorSnapshot leyendo SOLO state/selectors/.
// Lo que el store no guarda (el recorrido, con quién se habló, las líneas de escenas anteriores) lo acumula
// un historial puro que avanza con cada estado; el snapshot es estado + historial, sin inventar nada.
import { DIALOGUE_CAP, PATH_CAP, type DirectorSnapshot } from "@lg/protocol/director";
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
  /** Clave de la escena cuyas líneas se están siguiendo y cuántas ya se tomaron. */
  sceneKey: string | null;
  linesSeen: number;
}

export const emptyHistory = (): DirectorHistory => ({ path: [], npcsTalked: [], dialogue: [], sceneKey: null, linesSeen: 0 });

/** Una línea final de la escena. Hasta F4 el store no dice quién dijo cada línea: se atribuye a la escena (NPC). */
export const finalLine = (scene: OpenScene, index: number, text: string): { turnId: string; speaker: string; text: string } => ({
  turnId: `${scene.sceneId ?? scene.npcId ?? "escena"}#${index}`,
  speaker: scene.npcId ?? "desconocido",
  text,
});

const sceneKey = (scene: OpenScene): string => `${scene.sceneId ?? "-"}|${scene.npcId ?? "-"}`;
const sameTile = (a: Tile | undefined, b: Tile): boolean => a !== undefined && a.x === b.x && a.y === b.y;
const keepLast = <T>(list: T[], cap: number): T[] => (list.length > cap ? list.slice(list.length - cap) : list);

/**
 * Avanza el historial con un estado nuevo. Devuelve el MISMO objeto si nada cambió (así el emisor no ve cambios
 * falsos). `path` guarda solo cambios de tile (≤ 500, sale el más viejo); `dialogue`, las últimas 20 líneas finales.
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
}

/** El snapshot v1. `build` y `contentErrors` los completa el plugin de desarrollo (los sabe Node, no el cliente). */
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
  };
}
