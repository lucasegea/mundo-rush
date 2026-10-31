// @vitest-environment jsdom
// A2 (ADR-027): the conversation panel by meters inside the dialogue HUD, against the fake scene server.
// Bars with label and phase and NO numbers; "Lo que sabés de…"; the help ladder (server and client clock);
// tapping a suggested phrase puts it in the box (text); in voice it is shown to read; the closing notice.
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
    // No XP numbers: the only number is "N de M" (meters achieved), which is a count.
    expect(within(panel).getByTestId("conv-count").textContent).toBe("0 de 2");
    expect((panel.textContent ?? "").replace("0 de 2", "")).not.toMatch(/\d/);
    expect((screen.getByTestId("meter-fill-conocer") as HTMLElement).style.width).toBe("35%");
    // The second phase opens.
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
    expect(screen.getByTestId("conv-count").textContent).toBe("1 de 2");
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

describe("M4 (estetica-c): el medidor como tarjeta de segmentos", () => {
  const three = conv({
    activeMeter: "recado",
    meters: [
      { id: "conocer", kind: "rapport", label: "Conocer a Harlan", fill: 1, status: "full" },
      { id: "recado", kind: "request", label: "Conseguir lo que viniste a buscar", fill: 0.4, status: "active" },
      { id: "trato", kind: "negotiation", label: "Cerrar el trato", fill: 0, status: "locked" },
    ],
  });
  const view = () => {
    const v = reduceSceneMessage(initialDialogue(), three).conversation;
    if (!v) throw new Error("sin conversación");
    return v;
  };
  const seg = (id: string) => document.querySelector(`[data-meter="${id}"]`) as HTMLElement;

  test("cada segmento dice su estado por atributo y por texto accesible, no solo por color", () => {
    render(<ConversationPanel conv={view()} waiting={false} idleMs={[20_000, 40_000]} resetKey="0" onPhrase={null} />);
    expect(screen.getByRole("heading", { level: 2, name: "Conocer a Harlan" })).toBeTruthy();
    expect(screen.getByTestId("conv-count").textContent).toBe("1 de 3");
    expect(["conocer", "recado", "trato"].map((id) => seg(id).getAttribute("data-state"))).toEqual(["logrado", "actual", "pendiente"]);
    expect(seg("conocer").textContent).toBe("Conocer a Harlan · logrado");
    expect(seg("recado").textContent).toBe("Conseguir lo que viniste a buscar · actual");
    expect(seg("trato").textContent).toBe("Cerrar el trato · pendiente");
    // The status text is for screen readers (the shape says it at a glance).
    expect(within(seg("conocer")).getByText(/logrado/).className).toContain("sr-only");
  });

  test("logrado: ámbar con borde oscuro y etiqueta en negrita; actual: rayado; pendiente: vacío", () => {
    render(<ConversationPanel conv={view()} waiting={false} idleMs={[20_000, 40_000]} resetKey="0" onPhrase={null} />);
    const bar = (id: string) => within(seg(id)).getByRole("img");
    const label = (id: string) => seg(id).querySelector("span") as HTMLElement;
    expect(bar("conocer").className).toContain("bg-amber");
    expect(bar("conocer").className).toContain("border-amber-strong");
    expect(label("conocer").className).toContain("font-bold");
    expect(bar("recado").className).toContain("lg-stripes");
    expect(bar("recado").className).not.toContain("bg-amber");
    expect(label("recado").className).not.toContain("font-bold");
    expect(bar("trato").className).not.toContain("lg-stripes");
    expect(bar("trato").className).not.toContain("bg-amber");
    expect((screen.getByTestId("meter-fill-recado") as HTMLElement).style.width).toBe("40%");
  });

  test("sobre el mapa la tarjeta flota arriba a la izquierda solo desde pantallas medianas (en angostas baja)", () => {
    const { rerender } = render(<ConversationPanel conv={view()} waiting={false} idleMs={[20_000, 40_000]} resetKey="0" onPhrase={null} floating />);
    const classes = () => screen.getByTestId("conv-meter").className.split(" ");
    expect(classes()).toEqual(expect.arrayContaining(["md:fixed", "md:left-4", "md:top-4"]));
    expect(classes()).not.toContain("fixed");
    rerender(<ConversationPanel conv={view()} waiting={false} idleMs={[20_000, 40_000]} resetKey="0" onPhrase={null} />);
    expect(classes().some((c) => c.includes("fixed"))).toBe(false);
  });
});
