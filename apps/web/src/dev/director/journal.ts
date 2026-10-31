// Events of the test-session journal that come out of comparing two states (03 §6.5.2, D-192).
// Pure: same pair of states → same events. Final text only, never audio (D-108).
import type { JournalEventInput } from "@lg/protocol/director";
import {
  selectCurrentDiorama, selectFinalLines, selectOpenScene, selectPlayerTile, type GameState,
} from "../../state/selectors";
import { finalLine } from "./snapshot";

export function journalEvents(prev: GameState | null, next: GameState, at: string): JournalEventInput[] {
  const out: JournalEventInput[] = [];

  const tile = selectPlayerTile(next);
  const before = prev ? selectPlayerTile(prev) : null;
  if (tile && (!before || before.x !== tile.x || before.y !== tile.y)) {
    out.push({ type: "move.cell", at, diorama: selectCurrentDiorama(next), tile });
  }

  const was = prev ? selectOpenScene(prev) : null;
  const is = selectOpenScene(next);
  const sameScene = was !== null && is !== null && was.sceneId === is.sceneId && was.npcId === is.npcId;
  if (was && !sameScene) {
    // Until F4 the scene is a placeholder: it closes with no result and no evaluated criteria.
    out.push({ type: "scene.end", at, result: "cerrada", criteriaMet: [] });
  }
  if (is && !sameScene) {
    if (is.npcId) out.push({ type: "interact", at, targetId: is.npcId });
    out.push({ type: "scene.start", at, missionId: is.missionId, sceneId: is.sceneId, npcId: is.npcId });
  }

  if (is) {
    const lines = selectFinalLines(next);
    const seen = sameScene && prev ? selectFinalLines(prev).length : 0;
    lines.slice(seen).forEach((text, i) => {
      out.push({ type: "line", at, ...finalLine(is, seen + i, text) });
    });
  }
  return out;
}
