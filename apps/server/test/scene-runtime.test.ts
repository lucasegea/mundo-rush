// F4.1 A2, A7 y las invariantes (d) y (e) en el runtime: servidor + núcleo + modelos falsos sobre el contenido real.
import { describe, expect, test } from "vitest";
import { createMemoryEvidenceStore } from "../src/store/evidence.ts";
import { NOT_INTRODUCED_LINE } from "../src/scene-runtime/runtime.ts";
import { M01_RULES, M02_RULES, M03_RULES, observerJson } from "./fakes/text-model.ts";
import { harness, play } from "./helpers.ts";

describe("A2: una escena del prólogo completa sus criterios (servidor + core + modelo falso)", () => {
  test("M0.1 con Inés: saludo + nombre → closing → posttask → done, con éxito", async () => {
    const h = harness({ rules: M01_RULES, replies: ["Hello! And your name?"] });
    await play(h, "NPC-INES", ["Hello!", "I'm Nico."]);
    expect(h.of("scene.opened")[0]).toMatchObject({ missionId: "M0.1", sceneId: "M0.1-E1", npcId: "NPC-INES", modality: "text" });
    expect(h.steps()).toEqual([
      "pretask", "pretask", "npcOpening", "playerTurn.waiting",
      "playerTurn.speaking", "playerTurn.endPending", "npcTurn", "playerTurn.waiting", // turno 1: solo saludo
      "playerTurn.speaking", "playerTurn.endPending", "npcTurn", "closing", "posttask", "done", // turno 2: criterios
    ]);
    const end = h.of("scene.end")[0];
    expect(end?.outcome).toBe("success");
    expect(end?.criteriaMet).toEqual(["C1", "C2"]);
    // Pretarea de Lumi (plantilla), apertura guionada y cierre guionado, en ese orden.
    const lines = h.of("npc.line").map((m) => `${m.line.kind}:${m.line.text ?? m.line.template}`);
    expect(lines[0]).toBe("pretask:LUMI-M0.1-PRE");
    expect(lines).toContain("opening:Hello! Welcome to Kestrel Valley.");
    expect(lines).toContain("reply:Hello! And your name?");
    expect(lines).toContain("closing:Here's your key.");
    // El observador vio los dos turnos; el NPC recibió el prompt del servidor con la apertura como turno previo.
    expect(h.observer.observed.map((c) => c.playerText)).toEqual(["Hello!", "I'm Nico."]);
    expect(h.npc.calls[0]?.system).toContain("=== PERSONA: INÉS CALDER ===");
    expect(h.npc.calls[0]?.turns.some((t) => t.role === "model" && t.text.includes("Hello! Welcome to Kestrel Valley."))).toBe(true);
  });

  test("el reloj de escena arranca en npcOpening y los topes quedan programados; al cerrar se cancelan", async () => {
    const h = harness({ rules: M01_RULES });
    await h.session.receive({ type: "scene.start", npcId: "NPC-INES" });
    expect(h.scheduler.pendingCount).toBe(2);
    await h.session.receive({ type: "turn.text", text: "Hi! I'm Nico." });
    expect(h.session.snapshot.state).toBe("done");
    expect(h.scheduler.pendingCount).toBe(0);
  });
});

describe("A7: efectos de M0.1 y presentación de Nell", () => {
  test("cerrar M0.1 emite la cucheta encendida e intro:NPC-MAYA, y lo deja en la evidencia", async () => {
    const h = harness({ rules: M01_RULES });
    await play(h, "NPC-INES", ["Hello! I'm Nico."]);
    const fx = h.of("scene.effects")[0];
    expect(fx).toMatchObject({ missionId: "M0.1", sceneId: "M0.1-E1" });
    expect(fx?.effects).toEqual([{ flag: "lamp_bunk_on" }, { intro: "NPC-MAYA" }]);
    const outcome = h.evidence.list("op-local").find((e) => e.kind === "mission_outcome");
    expect(outcome).toMatchObject({ outcome: "success", missionId: "M0.1", effects: fx?.effects, criteriaMet: ["C1", "C2"] });
  });

  test("Nell sin la presentación de Maya: \"Hi! Do I know you?\" y no abre M1.1", async () => {
    const h = harness({ rules: M01_RULES });
    await h.session.receive({ type: "scene.start", npcId: "NPC-NELL" });
    expect(h.of("npc.line").map((m) => m.line)).toEqual([
      { lineId: "id-1", speaker: "NPC-NELL", kind: "notIntroduced", text: NOT_INTRODUCED_LINE, template: null },
    ]);
    expect(h.of("scene.blocked")).toEqual([{ type: "scene.blocked", npcId: "NPC-NELL", reason: "notIntroduced" }]);
    expect(h.of("scene.opened")).toEqual([]);
    expect(h.session.snapshot.state).toBe("idle");
    expect(h.npc.calls).toEqual([]);
  });

  test("el prólogo corre M0.1 → M0.2 → M0.3; después Nell abre M1.1", async () => {
    const evidence = createMemoryEvidenceStore();
    const h = harness({ evidence, observe: (c) => observerJson(c, [...M01_RULES, ...M02_RULES, ...M03_RULES]) });
    // Maya antes de M0.2: no hay escena.
    await h.session.receive({ type: "scene.start", npcId: "NPC-MAYA" });
    expect(h.of("scene.blocked").at(-1)).toMatchObject({ reason: "noScene" });

    await play(h, "NPC-INES", ["Hello! I'm Nico."]);
    await h.session.receive({ type: "scene.start", npcId: "NPC-MAYA" });
    expect(h.of("scene.blocked").at(-1)).toMatchObject({ npcId: "NPC-MAYA", reason: "noScene" });

    // M0.2 es de Lumi (sin NPC): se abre con npcId null y el NPC no responde (no hay modelo de NPC).
    const npcCalls = h.npc.calls.length;
    await play(h, null, ["What's this?"]);
    expect(h.of("scene.opened").at(-1)).toMatchObject({ missionId: "M0.2", npcId: null });
    expect(h.npc.calls.length).toBe(npcCalls);
    expect(h.of("scene.end").at(-1)?.outcome).toBe("success");

    await play(h, "NPC-MAYA", ["Yes! The canal."]);
    expect(h.of("scene.opened").at(-1)).toMatchObject({ missionId: "M0.3" });
    expect(h.of("scene.effects").at(-1)?.effects).toEqual([{ flag: "firefly_crossing_1" }, { intro: "NPC-NELL" }]);

    // Una conexión nueva (otra sesión) ve el progreso plegado de la evidencia: Nell ya fue presentada.
    const again = h.reconnect();
    await again.receive({ type: "scene.start", npcId: "NPC-NELL" });
    expect(h.of("scene.opened").at(-1)).toMatchObject({ missionId: "M1.1", npcId: "NPC-NELL" });
    again.close();
  });

  test("Kofi no tiene escena en el prólogo (solo líneas ambientales)", async () => {
    const h = harness();
    await h.session.receive({ type: "scene.start", npcId: "NPC-KOFI" });
    expect(h.of("scene.blocked")).toEqual([{ type: "scene.blocked", npcId: "NPC-KOFI", reason: "noScene" }]);
  });
});

describe("topes (D-130) e invariantes (d) y (e) en el runtime", () => {
  test("(e) hardCap durante playerTurn.waiting → closing: sesión cerrada, línea de salida ya en closing, sin respuesta del NPC", async () => {
    const h = harness({ rules: [] });
    await h.session.receive({ type: "scene.start", npcId: "NPC-INES" });
    expect(h.session.snapshot.state).toBe("playerTurn");
    const before = h.sent.length;
    h.scheduler.advance(300_000);
    await h.session.settled();
    const after = h.sent.slice(before);
    // 4:00 marca softCap sin cortar (sigue playerTurn.waiting); 5:00 pasa a closing.
    expect(after.filter((m) => m.type === "scene.state").map((m) => (m.type === "scene.state" ? `${m.state}:${m.softCapReached}` : "")))
      .toEqual(["playerTurn:true", "closing:true", "posttask:true", "done:true"]);
    // La línea de salida llega después del cambio a closing (nunca con playerTurn vigente).
    const closingIdx = after.findIndex((m) => m.type === "scene.state" && m.state === "closing");
    const exitIdx = after.findIndex((m) => m.type === "npc.line" && m.line.kind === "exit");
    expect(exitIdx).toBeGreaterThan(closingIdx);
    expect(h.session.snapshot.state).toBe("done");
    expect(h.session.snapshot.ctx.sessionOpen).toBe(false);
    expect(h.of("scene.end")[0]?.outcome).toBe("hardCap");
    expect(h.npc.calls).toEqual([]);
    // Un texto tardío ya no genera nada.
    await h.session.receive({ type: "turn.text", text: "Hello?" });
    expect(h.of("error").at(-1)?.code).toBe("not_your_turn");
    expect(h.npc.calls).toEqual([]);
  });

  test("(e) hardCap con la respuesta del NPC en vuelo: la respuesta se descarta y no se pide otra", async () => {
    const h = harness({ rules: [] });
    await h.session.receive({ type: "scene.start", npcId: "NPC-INES" });
    h.clock.advance(0);
    // El turno queda en npcTurn hasta que el modelo responda; el tope llega antes.
    const pendingTurn = h.session.receive({ type: "turn.text", text: "Hmm." });
    h.scheduler.advance(300_000);
    await pendingTurn;
    expect(h.of("npc.line").filter((m) => m.line.kind === "reply")).toEqual([]);
    expect(h.npc.calls.length).toBe(1);
    expect(h.session.snapshot.state).toBe("done");
  });

  test("softCap en playerTurn no corta: nonConverging recién después de la línea del NPC; (d) lo cumplido no se pierde", async () => {
    const h = harness({ rules: M01_RULES });
    await h.session.receive({ type: "scene.start", npcId: "NPC-INES" });
    await h.session.receive({ type: "turn.text", text: "Hello!" }); // C1 cumplido
    h.scheduler.advance(240_000);
    expect(h.session.snapshot.state).toBe("playerTurn");
    expect(h.session.snapshot.ctx.softCapReached).toBe(true);
    await h.session.receive({ type: "turn.text", text: "Bus." });
    expect(h.steps().slice(-7)).toEqual(["playerTurn.speaking", "playerTurn.endPending", "npcTurn", "nonConverging", "closing", "posttask", "done"]);
    const end = h.of("scene.end")[0];
    expect(end?.outcome).toBe("partial");
    expect(end?.criteriaMet).toEqual(["C1"]);
    // Salida guionada de la ficha y los mismos efectos en el mundo (02: "Llave y mapa igual").
    expect(h.of("npc.line").some((m) => m.line.kind === "exit" && m.line.text === "It's okay! You're the new worker. Welcome!")).toBe(true);
    expect(h.of("scene.effects")[0]?.effects).toEqual([{ flag: "lamp_bunk_on" }, { intro: "NPC-MAYA" }]);
  });
});

describe("mensajes del cliente", () => {
  test("pasar el turno: Más simple cierra el turno con la nota [DIRECTOR]; Pista vuelve a esperar", async () => {
    const h = harness({ rules: [] });
    await h.session.receive({ type: "scene.start", npcId: "NPC-INES" });
    await h.session.receive({ type: "turn.pass" });
    expect(h.session.snapshot.sub).toBe("passMenu");
    await h.session.receive({ type: "turn.choose", option: "hint" });
    expect(h.session.snapshot.sub).toBe("waiting");
    await h.session.receive({ type: "turn.pass" });
    await h.session.receive({ type: "turn.choose", option: "simpler" });
    expect(h.npc.calls.at(-1)?.turns.at(-1)?.text).toMatch(/^\[DIRECTOR\] The player asked for something simpler/);
    expect(h.observer.observed).toEqual([]); // sin texto del jugador no hay nada que observar
    expect(h.session.snapshot.sub).toBe("waiting");
  });

  test("errores del protocolo: mensaje inválido, voz reservada, escena ocupada, NPC desconocido, turno ajeno", async () => {
    const h = harness();
    await h.session.receive({ type: "turn.text" });
    await h.session.receive({ type: "voice.turnStart" });
    await h.session.receive({ type: "scene.start", npcId: "NPC-NADIE" });
    await h.session.receive({ type: "turn.choose", option: "hint" });
    await h.session.receive({ type: "scene.start", npcId: "NPC-INES" });
    await h.session.receive({ type: "scene.start", npcId: "NPC-INES" });
    expect(h.of("error").map((e) => e.code)).toEqual(["bad_message", "not_voice", "unknown_npc", "not_your_turn", "scene_busy"]);
  });

  test("abort y cierre de la conexión: la escena queda abortada, sin efectos ni misión cumplida", async () => {
    const h = harness({ rules: M01_RULES });
    await h.session.receive({ type: "scene.start", npcId: "NPC-INES" });
    await h.session.receive({ type: "scene.abort" });
    expect(h.session.snapshot.state).toBe("aborted");
    expect(h.of("scene.end")[0]).toMatchObject({ outcome: "aborted" });
    expect(h.of("scene.effects")).toEqual([]);
    expect(h.scheduler.pendingCount).toBe(0);
    // Se reanuda desde el inicio: la misma escena vuelve a abrir.
    await h.session.receive({ type: "scene.start", npcId: "NPC-INES" });
    expect(h.of("scene.opened").at(-1)).toMatchObject({ sceneId: "M0.1-E1" });
    h.session.close();
    expect(h.session.snapshot.state).toBe("aborted");
  });

  test("observador con riesgo → contención: sin efectos ni misión cumplida", async () => {
    const h = harness({ observe: (c) => observerJson(c, [], { safety: "risk" }) });
    await play(h, "NPC-INES", ["..."]);
    expect(h.steps()).toContain("containment");
    expect(h.of("scene.notice").map((n) => n.code)).toContain("containment");
    expect(h.of("scene.end")[0]?.outcome).toBe("containment");
    expect(h.of("scene.effects")).toEqual([]);
  });

  test("riesgo que además cumple criterios: contención, sin evidencia (el texto del jugador no se guarda)", async () => {
    const evidence = createMemoryEvidenceStore();
    const h = harness({ evidence, observe: (c) => observerJson(c, M01_RULES, { safety: "risk" }) });
    await play(h, "NPC-INES", ["Hello! I'm Nico."]);
    expect(h.of("scene.end")[0]?.outcome).toBe("containment");
    expect(h.of("scene.end")[0]?.criteriaMet ?? []).toEqual([]);
    expect(evidence.list("op-local")).toEqual([]);
  });
});
