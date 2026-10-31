// `npm run dev:reset-farmer` (or `npm run dev:reset-encounter -- --npc NPC-X` / `--conv CONV-X`): development reset
// of a meters conversation encounter (A2, ADR-027; docs/PLAY.md). Works with the server running: the encounter store
// is read on every scene. Touches only apps/server/data/encounters.json (encounter state + reset mark
// for its missions); the evidence log and the rest of the progress stay the same. Operator account (op-local).
import { OPERATOR_ACCOUNT } from "./config/operator.ts";
import { GENERATED_CONTENT_DIR, readGeneratedContent } from "./content/loader.ts";
import { resetEncounter, ResetError } from "./conversation/reset.ts";
import { createFileEncounterStore, DEFAULT_ENCOUNTERS_PATH } from "./store/encounters.ts";

function targetFrom(argv: readonly string[]): string | null {
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === "--npc" || argv[i] === "--conv") && argv[i + 1]) return argv[i + 1] ?? null;
  }
  return null;
}

const target = targetFrom(process.argv.slice(2));
if (!target) {
  console.error("uso: node apps/server/src/reset-encounter.ts --npc NPC-HARLAN   (o --conv CONV-HARLAN)");
  process.exit(2);
}
try {
  const res = resetEncounter({
    store: createFileEncounterStore(DEFAULT_ENCOUNTERS_PATH), content: readGeneratedContent(GENERATED_CONTENT_DIR),
    target, accountId: OPERATOR_ACCOUNT, at: new Date().toISOString(),
  });
  console.log(`[reset] ${res.sheets.join(", ")}: estado ${res.cleared.length ? "borrado" : "ya vacío"} · misiones reiniciadas: ${res.missions.join(", ") || "ninguna"}. El resto del progreso no se tocó.`);
} catch (err) {
  console.error(`[reset] ${err instanceof ResetError || err instanceof Error ? err.message : "error"}`);
  process.exit(1);
}
