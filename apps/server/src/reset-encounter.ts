// `npm run dev:reset-farmer` (o `npm run dev:reset-encounter -- --npc NPC-X` / `--conv CONV-X`): reinicio de desarrollo
// de un encuentro de conversación por medidores (A2, ADR-027; docs/PLAY.md). Sirve con el servidor andando: el almacén de
// encuentros se lee en cada escena. Toca solo apps/server/data/encounters.json (estado del encuentro + marca de reinicio
// de sus misiones); el log de evidencia y el resto del progreso quedan igual. Cuenta del operador (op-local).
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
