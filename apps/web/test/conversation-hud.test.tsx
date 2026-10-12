// @vitest-environment jsdom
// A2 (ADR-027): el panel de la conversación por medidores dentro del HUD de diálogo, contra el servidor de escenas falso.
// Barras con etiqueta y fase y SIN números; "Lo que sabés de…"; la escalera de ayuda (servidor y reloj del cliente);
// tocar una frase sugerida la pone en la caja (texto); en voz se muestra para leer; el aviso de cierre.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ConversationStateMessage } from "@lg/protocol";
import { App } from "../src/App";
import { actions, reduceSceneMessage } from "../src/state/actions";
import { initialDialogue } from "../src/state/slices";
import { ConversationPanel } from "../src/ui/dialogue/ConversationPanel";
import { fakeSceneServer, openingFor, type FakeSceneServer } from "./fake-scene";
import { bootApp, compiledClientContent, fetchFromContent, resetStore } from "./helpers";

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

const conv = (over: Partial<ConversationStateMessage> = {}): ConversationStateMessage => ({
  type: "conversation.state", npcName: "Harlan", activeMeter: "conocer",
  meters: [
    { id: "conocer", kind: "rapport", label: "Conocer a Harlan", fill: 0.35, status: "active" },
    { id: "recado", kind: "request", label: "Conseguir lo que viniste a buscar", fill: 0, status: "locked" },
  ],
  facts: [{ id: "granero", label: "Su padre construyó el granero rojo" }],
  stalled: false, notice: null,
  help: { level: 0, hint: "Preguntale por su vida.", phrases: ["Is this your farm?", "How long have you lived here?"] },
  completed: false,
  ...over,
});

async function startHarlan(server: FakeSceneServer) {
  await act(async () => { stop = await bootApp({ webgl2: false, fetchJson: fetchFromContent(compiledClientContent()), scene: { connector: server.connector } }); });
  render(<App />);
  await act(async () => {
    actions.enterScene("NPC-HARLAN", null);
    await server.waitOpen();
  });
  await act(async () => { for (const m of openingFor("NPC-HARLAN", "M9.1", "M9.1-E1")) server.push(m); });
}

describe("reductor", () => {
  test("conversation.state entra al slice sin el tipo; una escena nueva lo limpia", () => {
    const d = reduceSceneMessage(initialDialogue(), conv());
    expect(d.conversation).toMatchObject({ npcName: "Harlan", activeMeter: "conocer" });
    expect(d.conversation && "type" in d.conversation).toBe(false);
    expect(initialDialogue().conversation).toBeNull();
  });
});

describe("panel de medidores", () => {
  test("barras con etiqueta y fase, sin números; Lo que sabés de Harlan", async () => {
    const server = fakeSceneServer();
    await startHarlan(server);
    await act(async () => { server.push(conv()); });
    const panel = screen.getByTestId("conversation-panel");
    expect(within(panel).getByTestId("conv-phase").textContent).toBe("Ahora: Conocer a Harlan");
    expect(within(panel).getByRole("img", { name: "Conocer a Harlan: un poco" })).toBeTruthy();
    expect(within(panel).getByRole("img", { name: "Conseguir lo que viniste a buscar: se abre después" })).toBeTruthy();
    expect(within(panel).getByText("Lo que sabés de Harlan")).toBeTruthy();
    expect(within(panel).getByText("Su padre construyó el granero rojo")).toBeTruthy();
    expect(panel.textContent ?? "").not.toMatch(/\d/); // nada de números a la vista
    expect((screen.getByTestId("meter-fill-conocer") as HTMLElement).style.width).toBe("35%");
    // Se abre la segunda fase.
    await act(async () => {
      server.push(conv({
        activeMeter: "recado",
        meters: [
          { id: "conocer", kind: "rapport", label: "Conocer a Harlan", fill: 1, status: "full" },
          { id: "recado", kind: "request", label: "Conseguir lo que viniste a buscar", fill: 0.2, status: "active" },
        ],
      }));
    });
    expect(screen.getByTestId("conv-phase").textContent).toBe("Ahora: Conseguir lo que viniste a buscar");
    expect(screen.getByRole("img", { name: "Conocer a Harlan: lleno" })).toBeTruthy();
  });

  test("ayuda del servidor: escalón 1 pista, escalón 2 frases; tocar una frase la pone en la caja", async () => {
    const server = fakeSceneServer();
    await startHarlan(server);
    await act(async () => { server.push(conv()); });
    expect(screen.queryByTestId("conv-help")).toBeNull();
    await act(async () => { server.push(conv({ help: { level: 1, hint: "Preguntale por su vida.", phrases: ["Is this your farm?"] } })); });
    expect(screen.getByTestId("conv-help").textContent).toContain("Preguntale por su vida.");
    expect(screen.queryByTestId("conv-phrases")).toBeNull();
    await act(async () => { server.push(conv({ help: { level: 2, hint: "Preguntale por su vida.", phrases: ["Is this your farm?"] } })); });
    fireEvent.click(screen.getByRole("button", { name: "Usar esta frase: Is this your farm?" }));
    expect((screen.getByRole("textbox", { name: "Tu respuesta (en inglés)" }) as HTMLTextAreaElement).value).toBe("Is this your farm?");
  });

  test("ayuda por silencio: a los 20 s la pista y a los 40 s las frases, solo en tu turno", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const server = fakeSceneServer();
    await startHarlan(server);
    await act(async () => { server.push(conv()); });
    await act(async () => { vi.advanceTimersByTime(19_900); });
    expect(screen.queryByTestId("conv-help")).toBeNull();
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(screen.getByTestId("conv-help").getAttribute("data-level")).toBe("1");
    await act(async () => { vi.advanceTimersByTime(20_000); });
    expect(screen.getByTestId("conv-help").getAttribute("data-level")).toBe("2");
    expect(screen.getByTestId("conv-phrases")).toBeTruthy();
  });

  test("sin caja de texto (voz) las frases se muestran para leer en voz alta (no son botones)", () => {
    const view = reduceSceneMessage(initialDialogue(), conv({ help: { level: 2, hint: "Contale algo tuyo.", phrases: ["I'm from Argentina."] } })).conversation;
    if (!view) throw new Error("sin conversación");
    render(<ConversationPanel conv={view}waiting={false} idleMs={[20_000, 40_000]} resetKey="0" onPhrase={null} />);
    const phrases = screen.getByTestId("conv-phrases");
    expect(within(phrases).getByText("I'm from Argentina.").tagName).toBe("SPAN");
    expect(within(phrases).queryByRole("button")).toBeNull();
  });

  test("reciprocidad y cierre: avisos en llano", async () => {
    const server = fakeSceneServer();
    await startHarlan(server);
    await act(async () => { server.push(conv({ stalled: true })); });
    expect(screen.getByText("Harlan quiere saber de vos.")).toBeTruthy();
    await act(async () => { server.push(conv({ completed: true })); });
    expect(screen.getByTestId("conv-completed").textContent).toBe("¡Harlan aceptó! Despedite o dale las gracias.");
  });
});
