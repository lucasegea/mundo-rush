// @vitest-environment jsdom
// F5.2: el HUD de diálogo en una escena de voz contra un servidor de escenas falso y un motor de audio falso (sin
// navegador, sin micrófono, sin red). Pulsar-para-hablar y "Terminé" cierran el turno; indicador "te escucho /
// pensando"; medidor; lo que se va oyendo; sin permiso de micrófono → modo texto con un mensaje claro.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ServerMessage } from "@lg/protocol";
import { App } from "../src/App";
import { TALK_TAIL_MS } from "../src/services/audio";
import { actions } from "../src/state/actions";
import { gameStore } from "../src/state/store";
import { HOLD_TO_TALK_MS } from "../src/ui/dialogue/DialogueHud";
import { fakeSceneServer, type FakeSceneServer } from "./fake-scene";
import { fakeEngineFactory } from "./fake-audio";
import { bootApp, resetStore } from "./helpers";

let consoleError: ReturnType<typeof vi.spyOn>;
let consoleWarn: ReturnType<typeof vi.spyOn>;
let stop: (() => void) | null = null;

beforeEach(() => {
  resetStore();
  consoleError = vi.spyOn(console, "error");
  consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  stop?.();
  stop = null;
  cleanup();
  vi.useRealTimers();
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
  consoleWarn.mockRestore();
});

const st = (state: string, sub: string | null, turnIndex = 0, modality: "voice" | "text" = "voice"): ServerMessage =>
  ({ type: "scene.state", state, sub, modality, turnIndex, softCapReached: false }) as ServerMessage;

const voiceOpening = (modality: "voice" | "text" = "voice"): ServerMessage[] => [
  { type: "scene.opened", sceneRunId: "run-1", missionId: "M0.1", sceneId: "M0.1-E1", npcId: "NPC-INES", modality },
  st("pretask", null, 0, modality),
  st("npcOpening", null, 0, modality),
  { type: "npc.line", line: { lineId: "l-open", speaker: "NPC-INES", kind: "opening", text: "Hello! Welcome to Kestrel Valley.", template: null } },
  st("playerTurn", "waiting", 0, modality),
];

/** Arranca en solo-diálogo con voz y entra a hablar con Inés. */
async function startVoice(server: FakeSceneServer, engines = fakeEngineFactory(), modality: "voice" | "text" = "voice") {
  await act(async () => {
    stop = await bootApp({ webgl2: false, scene: { connector: server.connector, audio: { createEngine: engines.createEngine } } });
  });
  render(<App />);
  await act(async () => {
    actions.enterScene("NPC-INES", null);
    await server.waitOpen();
  });
  await act(async () => { await vi.waitFor(() => expect(server.sent.length).toBeGreaterThan(0)); });
  await act(async () => { for (const m of voiceOpening(modality)) server.push(m); });
  return engines;
}

const talkButton = () => screen.getByRole("button", { name: "Hablar" });
const status = () => within(screen.getByTestId("voice-controls")).getByRole("status");
const sentTypes = (server: FakeSceneServer) => server.sent.map((m) => m.type);

describe("escena de voz", () => {
  test("pide la escena en voz; en tu turno: Hablar con foco, indicador y medidor, sin caja de texto", async () => {
    const server = fakeSceneServer();
    await startVoice(server);
    expect(server.sent[0]).toEqual({ type: "scene.start", npcId: "NPC-INES", modality: "voice" });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.activeElement).toBe(talkButton());
    expect(status().getAttribute("data-voice-phase")).toBe("yourTurn");
    expect(status().textContent).toContain("Mantené apretado Hablar");
    expect(screen.getByTestId("mic-level")).toBeTruthy();
    expect(screen.getByRole("log", { name: "Conversación" }).textContent).toContain("Hello! Welcome to Kestrel Valley.");
  });

  test("pulsar-para-hablar: mantener Hablar abre el turno (te escucho), soltar lo cierra tras la cola corta", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const server = fakeSceneServer();
    const engines = await startVoice(server);
    await act(async () => { fireEvent.pointerDown(talkButton()); });
    expect(sentTypes(server)).toEqual(["scene.start", "voice.turnStart"]);
    expect(status().getAttribute("data-voice-phase")).toBe("listening");
    expect(status().textContent).toContain("Te escucho");
    expect(talkButton().getAttribute("aria-pressed")).toBe("true");
    act(() => { engines.last?.speak(); });
    expect(server.binary).toHaveLength(1);
    await act(async () => { vi.advanceTimersByTime(HOLD_TO_TALK_MS); fireEvent.pointerUp(talkButton()); });
    expect(status().textContent).toContain("Cerrando tu turno");
    await act(async () => { vi.advanceTimersByTime(TALK_TAIL_MS); });
    expect(sentTypes(server)).toEqual(["scene.start", "voice.turnStart", "voice.turnEnd"]);
    // El servidor confirma: turno del NPC → "pensando".
    await act(async () => { server.push(st("npcTurn", null, 1)); });
    expect(status().getAttribute("data-voice-phase")).toBe("thinking");
    expect(status().textContent).toContain("Inés Calder está pensando");
  });

  test("tocar Hablar (sin mantener) abre el turno y Terminé lo cierra: nadie corta al jugador", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const server = fakeSceneServer();
    await startVoice(server);
    await act(async () => { fireEvent.pointerDown(talkButton()); fireEvent.pointerUp(talkButton()); });
    expect(status().getAttribute("data-voice-phase")).toBe("listening");
    await act(async () => { vi.advanceTimersByTime(60_000); }); // un minuto en silencio: el turno sigue abierto
    expect(sentTypes(server)).toEqual(["scene.start", "voice.turnStart"]);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Terminé" })); });
    await act(async () => { vi.advanceTimersByTime(TALK_TAIL_MS); });
    expect(sentTypes(server)).toEqual(["scene.start", "voice.turnStart", "voice.turnEnd"]);
  });

  test("teclado: Enter/Espacio sobre Hablar (click sin puntero) abre y, otra vez, cierra el turno", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const server = fakeSceneServer();
    await startVoice(server);
    await act(async () => { fireEvent.click(talkButton(), { detail: 0 }); });
    expect(sentTypes(server)).toEqual(["scene.start", "voice.turnStart"]);
    await act(async () => { fireEvent.click(talkButton(), { detail: 0 }); vi.advanceTimersByTime(TALK_TAIL_MS); });
    expect(sentTypes(server)).toEqual(["scene.start", "voice.turnStart", "voice.turnEnd"]);
  });

  test("lo que se va oyendo se muestra; la final entra al historial como tu línea; la voz del NPC bloquea Hablar", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const server = fakeSceneServer();
    const engines = await startVoice(server);
    await act(async () => { fireEvent.pointerDown(talkButton()); });
    await act(async () => { server.push({ type: "turn.transcript", turnId: "run-1:1", speaker: "player", text: "Hello, I'm", final: false }); });
    expect(screen.getByText("Te oigo: Hello, I'm")).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(HOLD_TO_TALK_MS); fireEvent.pointerUp(talkButton()); vi.advanceTimersByTime(TALK_TAIL_MS); });
    await act(async () => {
      server.push(st("npcTurn", null, 1));
      server.push({ type: "turn.transcript", turnId: "run-1:1", speaker: "player", text: "Hello, I'm Nico.", final: true });
      server.pushBinary(new ArrayBuffer(8));
    });
    expect(screen.queryByText(/Te oigo:/)).toBeNull();
    const log = screen.getByRole("log", { name: "Conversación" });
    expect(within(log).getByText("Hello, I'm Nico.")).toBeTruthy();
    expect(status().getAttribute("data-voice-phase")).toBe("npcSpeaking");
    expect(engines.last?.played).toHaveLength(1);
    await act(async () => {
      server.push({ type: "npc.line", line: { lineId: "r1", speaker: "NPC-INES", kind: "reply", text: "Nice to meet you, Nico!", template: null } });
      server.push(st("playerTurn", "waiting", 1));
    });
    expect(talkButton().getAttribute("aria-disabled")).toBe("true"); // todavía suena
    await act(async () => { fireEvent.pointerDown(talkButton()); });
    expect(sentTypes(server).filter((t) => t === "voice.turnStart")).toHaveLength(1);
    await act(async () => { engines.last?.drain(); });
    expect(status().getAttribute("data-voice-phase")).toBe("yourTurn");
    expect(talkButton().getAttribute("aria-disabled")).toBe("false");
  });

  test("el servidor no entendió nada: aviso para acercarse al micrófono", async () => {
    const server = fakeSceneServer();
    await startVoice(server);
    await act(async () => { server.push({ type: "turn.transcript", turnId: "run-1:1", speaker: "player", text: "", final: true }); });
    expect(screen.getByText(/No te entendimos/)).toBeTruthy();
  });
});

describe("sin micrófono: modo texto con un mensaje claro", () => {
  test.each([
    ["denied", /No hay permiso para usar el micrófono: seguimos por texto/],
    ["noDevice", /No encontramos un micrófono: seguimos por texto/],
  ] as const)("%s → scene.start por texto, el motivo y la caja de texto", async (problem, message) => {
    const server = fakeSceneServer();
    await startVoice(server, fakeEngineFactory({ ok: false, problem }), "text");
    expect(server.sent[0]).toEqual({ type: "scene.start", npcId: "NPC-INES", modality: "text" });
    expect(screen.getByTestId("mic-problem").textContent).toMatch(message);
    expect(screen.getByRole("textbox", { name: "Tu respuesta (en inglés)" })).toBeTruthy();
    expect(screen.queryByTestId("voice-controls")).toBeNull();
  });

  test("el servidor no tiene voz (sin clave): texto con su aviso y el micrófono se suelta", async () => {
    const server = fakeSceneServer();
    const engines = await startVoice(server, fakeEngineFactory(), "text");
    expect(engines.last?.closed).toBe(true);
    expect(screen.queryByTestId("voice-controls")).toBeNull();
    expect(screen.queryByTestId("mic-problem")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Tu respuesta (en inglés)" })).toBeTruthy();
    expect(gameStore.getState().dialogue.voice.audio).toBe("off");
  });

  test("el micrófono se pierde con la escena en voz: mensaje para salir y volver a entrar", async () => {
    const server = fakeSceneServer();
    const engines = await startVoice(server);
    await act(async () => { engines.last?.loseMic(); });
    expect(screen.getByTestId("mic-problem").textContent).toContain("Se perdió el micrófono");
    expect(screen.queryByTestId("voice-controls")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

describe("M4 (estetica-c): indicador y barra en voz", () => {
  test("tu turno: punto verde que late (quieto con reducir movimiento); Terminé a la derecha de la barra, después de Hablar", async () => {
    const server = fakeSceneServer();
    await startVoice(server);
    const dot = () => within(screen.getByTestId("voice-controls")).getByTestId("turn-dot");
    expect(dot().getAttribute("data-dot")).toBe("turn");
    expect(dot().getAttribute("data-pulse")).toBe("true");
    act(() => { actions.setReduceMotion(true); });
    expect(dot().getAttribute("data-pulse")).toBe("false");
    expect(dot().className).not.toContain("lg-pulse");
    const bar = screen.getByRole("group", { name: "Ayudas para tu turno" });
    expect(within(bar).getAllByRole("button").map((b) => b.id)).toEqual(["scene-talk", "scene-pass", "scene-done"]);
  });
});
