// LIVE eval of text scenes (F4.1; D-027): 5 scenes of the prologue and Region 1 against the real text model
// of apps/server/config/models.yaml. It is NOT in `verify` nor in any test: it calls a paid API and only runs with the
// key in the environment (LG_GEMINI_API_KEY, presence is checked) AND the explicit authorization `--authorize`.
// Usage: node scripts/eval/live-text.ts --authorize   (compile first: npm run build:content)
// Prints the transcripts to stdout (without saving them: the evidence goes to an in-memory store). Never prints the key,
// the prompts or the model name in the transcripts; the final summary does name the role and the model used.
import { pathToFileURL } from "node:url";
import {
  createMemoryEvidenceStore, createSceneSession, GENERATED_CONTENT_DIR, loadModelsConfig, readGeneratedContent,
  realScheduler, systemClock, textProvidersFromEnv,
} from "@lg/server";
import type { ServerMessage } from "@lg/protocol";

export const AUTHORIZE_FLAG = "--authorize";
export const KEY_VAR = "LG_GEMINI_API_KEY";

/** The 5 scenes, in order (each enables the next through its `requiere`). Scripted player turns. */
export const EVAL_SCENES: readonly { npcId: string | null; turns: readonly string[] }[] = [
  { npcId: "NPC-INES", turns: ["Hello!", "I'm Nico."] },
  { npcId: null, turns: ["What's this?", "Lamp."] },
  { npcId: "NPC-MAYA", turns: ["Yes!", "There, by the canal. Near the bridge."] },
  { npcId: "NPC-NELL", turns: ["Hi! I'm Nico.", "I'm from Argentina.", "I'm fine, thanks. And you?"] },
  { npcId: "NPC-MAYA", turns: ["What color is Clover?", "Is she big or small?", "Does she have a bell?"] },
];

export type Gate = { ok: true } | { ok: false; reason: string };

/** D-027's two keys: the explicit flag and the key present. Without both nothing is called. */
export function liveEvalGate(argv: readonly string[], env: Record<string, string | undefined>): Gate {
  if (!argv.includes(AUTHORIZE_FLAG)) {
    return { ok: false, reason: `eval en vivo: llama a una API paga; corré con ${AUTHORIZE_FLAG} para autorizarla (D-027).` };
  }
  if ((env[KEY_VAR] ?? "") === "") return { ok: false, reason: `eval en vivo: ${KEY_VAR} no está en el entorno (presente: no).` };
  return { ok: true };
}

const describe = (m: ServerMessage): string | null => {
  switch (m.type) {
    case "npc.line":
      return `  ${m.line.speaker} [${m.line.kind}]: ${m.line.text ?? `(plantilla ${m.line.template ?? "?"})`}`;
    case "scene.opened":
      return `== ${m.missionId} / ${m.sceneId} (${m.npcId ?? "sin NPC"}) ==`;
    case "scene.blocked":
      return `  bloqueada: ${m.reason}`;
    case "scene.effects":
      return `  efectos: ${JSON.stringify(m.effects)}`;
    case "scene.end":
      return `  fin: ${m.outcome}; criterios: ${m.criteriaMet.join(", ") || "ninguno"}; evidencia: ${m.evidence.length}`;
    case "scene.notice":
    case "error":
      return `  ${m.type}: ${m.code}`;
    default:
      return null;
  }
};

export async function runLiveEval(env: Record<string, string | undefined>, print: (line: string) => void): Promise<number> {
  const models = loadModelsConfig();
  const content = readGeneratedContent(GENERATED_CONTENT_DIR);
  const evidence = createMemoryEvidenceStore();
  const providers = textProvidersFromEnv(models, env);
  let failures = 0;
  for (const scene of EVAL_SCENES) {
    let ended = false;
    const session = createSceneSession({
      content: () => content, ...providers, models, evidence, accountId: "op-local", clock: systemClock, scheduler: realScheduler,
    }, (m) => {
      if (m.type === "scene.end") ended = true;
      const line = describe(m);
      if (line) print(line);
    });
    await session.receive({ type: "scene.start", npcId: scene.npcId });
    for (const text of scene.turns) {
      if (ended || session.snapshot.state !== "playerTurn") break;
      print(`  JUGADOR: ${text}`);
      await session.receive({ type: "turn.text", text });
    }
    if (!ended) {
      failures++;
      print("  (no cerró o no abrió con los turnos guionados: se aborta y la siguiente escena puede quedar bloqueada)");
    }
    session.close();
  }
  print(`\nresumen: ${EVAL_SCENES.length - failures}/${EVAL_SCENES.length} escenas cerraron · rol textNpc=${models.roles.textNpc.model} · observer=${models.roles.observer.model}`);
  return failures === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const gate = liveEvalGate(process.argv.slice(2), process.env);
  if (!gate.ok) {
    console.error(gate.reason);
    process.exit(2);
  }
  process.exit(await runLiveEval(process.env, (l) => console.log(l)));
}
