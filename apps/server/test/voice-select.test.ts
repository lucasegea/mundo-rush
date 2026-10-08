// F5.1a A4: cambiar `voice.npc.adapter` en models.yaml cambia el adaptador sin tocar código fuera de
// apps/server/src/providers/. La selección vive en providers/voice.ts; scene-runtime, el gateway y la app solo ven la
// fábrica del contrato. Sin clave no hay voz (y el motivo no lleva la clave).
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { GEMINI_KEY_VAR, loadModelsConfig, type ModelsConfig } from "../src/config/models.ts";
import { voiceProviderFromConfig } from "../src/providers/voice.ts";
import { M01_RULES } from "./fakes/text-model.ts";
import { startFakeLiveServer, type FakeLiveServer } from "./fakes/live-server.ts";
import { harness, must, REPO_ROOT } from "./helpers.ts";

const KEY = "lg-test-key-select-0123456789";
const withAdapter = (adapter: "live" | "cascade"): ModelsConfig => {
  const m = loadModelsConfig();
  return { ...m, voice: { ...m.voice, npc: { adapter } } };
};

let live: FakeLiveServer | null = null;
afterEach(async () => {
  await live?.close();
  live = null;
});

describe("A4: el adaptador sale de la configuración", () => {
  test("models.yaml del repo: live (sin reporte de F0.1, D-149/D-162)", () => {
    expect(loadModelsConfig().voice.npc.adapter).toBe("live");
  });

  test("live → adaptador gemini-live; cascade → adaptador cascade; misma forma del contrato", () => {
    const env = { [GEMINI_KEY_VAR]: KEY };
    const a = must(voiceProviderFromConfig(withAdapter("live"), env).factory)();
    const b = must(voiceProviderFromConfig(withAdapter("cascade"), env).factory)();
    expect(a.adapter).toBe("gemini-live");
    expect(b.adapter).toBe("cascade");
    for (const p of [a, b]) {
      for (const k of ["open", "injectContext", "startTurn", "sendAudio", "endTurn", "interrupt", "close", "on"] as const) {
        expect(typeof p[k]).toBe("function");
      }
    }
  });

  test("sin clave, live no da fábrica y el motivo nombra la variable, nunca un valor", () => {
    const sel = voiceProviderFromConfig(withAdapter("live"), {});
    expect(sel.factory).toBeNull();
    expect(sel.reason).toContain(GEMINI_KEY_VAR);
  });

  test("el mismo runtime corre con live (servidor falso) y con cascade (cae a texto hasta F5.1b), solo cambiando la config", async () => {
    live = await startFakeLiveServer();
    const fake = live;
    const env = { [GEMINI_KEY_VAR]: KEY };
    const viaLive = harness({ rules: M01_RULES, voice: voiceProviderFromConfig(withAdapter("live"), env, { liveEndpoint: fake.url }).factory });
    await viaLive.session.receive({ type: "scene.start", npcId: "NPC-INES", modality: "voice" });
    for (let i = 0; i < 200 && viaLive.session.snapshot.state !== "playerTurn"; i++) await new Promise((r) => setTimeout(r, 10));
    expect(viaLive.session.snapshot.ctx.modality).toBe("voice");
    expect(fake.connections).toHaveLength(1);
    viaLive.session.close();
    await viaLive.session.settled();

    const viaCascade = harness({ rules: M01_RULES, voice: voiceProviderFromConfig(withAdapter("cascade"), env).factory });
    await viaCascade.session.receive({ type: "scene.start", npcId: "NPC-INES", modality: "voice" });
    expect(viaCascade.session.snapshot.ctx.modality).toBe("text");
    expect(viaCascade.of("scene.notice").map((n) => n.code)).toEqual(["model_unavailable"]);
    expect(fake.connections).toHaveLength(1); // cascade no tocó Live
  });

  test("ningún archivo fuera de src/providers/ importa un adaptador concreto", () => {
    const src = resolve(REPO_ROOT, "apps/server/src");
    const files: string[] = [];
    const walk = (d: string): void => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const f = join(d, e.name);
        if (e.isDirectory()) walk(f);
        else if (f.endsWith(".ts")) files.push(f);
      }
    };
    walk(src);
    const outside = files.filter((f) => !relative(src, f).replaceAll("\\", "/").startsWith("providers/"));
    expect(outside.length).toBeGreaterThan(10);
    const offenders = outside.filter((f) => /from\s+["'][^"']*providers\/(gemini-live|cascade)\//.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => relative(src, f))).toEqual([]);
  });
});
