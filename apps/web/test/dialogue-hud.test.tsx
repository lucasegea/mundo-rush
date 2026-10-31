// @vitest-environment jsdom
// F4.2 A1 + A3 (+ A5 of the plan without canvas): the dialogue HUD against a fake scene server (no network, no model).
// A1: Terminé closes the turn; the hint chip respects the setting (D-035); the glossary follows glossaryDisplay (D-131):
// one test per mode. A3: the SAME component in dialog-only and over the canvas.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "../src/App";
import { actions } from "../src/state/actions";
import { gameStore } from "../src/state/store";
import { Shell } from "../src/ui/shell/Shell";
import { fakeSceneServer, openingFor, stateMsg, type FakeSceneServer } from "./fake-scene";
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

type Glossary = { id: string; en: string; es: string; estado: "draft" | "reviewed" | "approved" }[];

/** Real compiled content; optionally with another glossaryDisplay and another glossary (D-131's three variants). */
function content(display?: "dev" | "release" | "fv", glossary?: Glossary) {
  const files = { ...compiledClientContent() };
  if (display) files["manifiesto.json"] = { glossaryDisplay: display };
  if (glossary) {
    files["glosario.json"] = glossary.map((g) => ({ id: g.id, en: g.en, traducciones: { "es-AR": { texto: g.es, notas: null } }, estado: g.estado }));
  }
  return files;
}

/** Starts without WebGL (dialog-only), with the fake server, and goes to talk with Inés. */
async function startScene(server: FakeSceneServer, files = content()) {
  await act(async () => { stop = await bootApp({ webgl2: false, fetchJson: fetchFromContent(files), scene: { connector: server.connector } }); });
  render(<App />);
  await act(async () => {
    actions.enterScene("NPC-INES", null);
    await server.waitOpen();
  });
  await act(async () => { for (const m of openingFor("NPC-INES")) server.push(m); });
  return userEvent.setup();
}

const input = () => screen.getByRole("textbox", { name: "Tu respuesta (en inglés)" });

describe("A5 (plan): entrar a la escena abre el HUD real contra el servidor de escenas", () => {
  test("desde la lista de lugares: pide la escena, muestra la pretarea de Lumi (por plantilla) y la apertura", async () => {
    const server = fakeSceneServer();
    await startScene(server);
    expect(server.sent[0]).toEqual({ type: "scene.start", npcId: "NPC-INES" });
    const hud = screen.getByTestId("dialogue-hud");
    expect(hud.getAttribute("data-surface")).toBe("dialogOnly");
    expect(screen.getByRole("heading", { level: 1, name: "Con Inés Calder" })).toBeTruthy();
    const log = screen.getByRole("log", { name: "Conversación" });
    // Lumi's line comes from the content by id (without the modeled English markup); the NPC's is the server's.
    expect(within(log).getByText(/Ella es Inés, la capataz de la cuadrilla/).textContent).toContain("Podés decir Hello");
    expect(log.textContent).toContain("Hello! Welcome to Kestrel Valley.");
    expect(screen.getByText("Tu turno. Tomate el tiempo que necesites.")).toBeTruthy();
    // Keyboard first: on your turn focus is on the text box.
    expect(document.activeElement).toBe(input());
  });

  test("sin servidor de escenas: falla clara y se puede volver", async () => {
    const server = fakeSceneServer({ fail: true });
    await act(async () => { stop = await bootApp({ webgl2: false, scene: { connector: server.connector } }); });
    render(<App />);
    const user = userEvent.setup();
    await act(async () => { actions.enterScene("NPC-INES", null); });
    await vi.waitFor(() => expect(gameStore.getState().dialogue.connection).toBe("error"));
    expect(screen.getAllByText(/No hay conexión con el servidor de escenas/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Volver" }));
    expect(gameStore.getState().ui.panels).toEqual([]);
  });

  test("salir de la escena cierra la conexión (el servidor aborta) y el foco vuelve a quien abrió", async () => {
    const server = fakeSceneServer();
    await act(async () => { stop = await bootApp({ webgl2: false, scene: { connector: server.connector } }); });
    render(<App />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Parada del colectivo/ }));
    await user.click(screen.getByRole("button", { name: "Hablar con Inés Calder" }));
    await act(async () => { await server.waitOpen(); });
    await act(async () => { for (const m of openingFor("NPC-INES")) server.push(m); });
    await user.keyboard("{Escape}");
    expect(server.closed).toBe(1);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Hablar con Inés Calder" }));
  });

  test("Seguir la historia abre la escena sin NPC (Lumi)", async () => {
    const server = fakeSceneServer();
    await act(async () => { stop = await bootApp({ webgl2: false, scene: { connector: server.connector } }); });
    render(<App />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Seguir la historia" }));
    await act(async () => { await server.waitOpen(); });
    expect(server.sent[0]).toEqual({ type: "scene.start", npcId: null });
    expect(screen.getByRole("heading", { level: 1, name: "Seguir la historia" })).toBeTruthy();
  });
});

describe("A1: Terminé cierra el turno", () => {
  test("escribir + Terminé manda el turno, lo muestra y cierra el turno del lado del cliente", async () => {
    const server = fakeSceneServer();
    const user = await startScene(server);
    await user.type(input(), "Hello! I'm Nico.");
    await user.click(screen.getByRole("button", { name: "Terminé" }));
    expect(server.sent.at(-1)).toEqual({ type: "turn.text", text: "Hello! I'm Nico." });
    expect((input() as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByRole("log").textContent).toContain("Vos:Hello! I'm Nico.");
    expect(screen.getByRole("button", { name: "Terminé" }).getAttribute("aria-disabled")).toBe("true");
    // A second Terminé before the server answers sends nothing.
    await user.click(screen.getByRole("button", { name: "Terminé" }));
    expect(server.sent.filter((m) => m.type === "turn.text")).toHaveLength(1);
  });

  test("Enter también es Terminé; Mayúscula + Enter es otra línea", async () => {
    const server = fakeSceneServer();
    const user = await startScene(server);
    await user.type(input(), "Hi!{Shift>}{Enter}{/Shift}I'm Nico.{Enter}");
    expect(server.sent.at(-1)).toEqual({ type: "turn.text", text: "Hi!\nI'm Nico." });
  });

  test("M4: Terminé responde a Enter y a Espacio sobre el botón (botón nativo) y anuncia sus teclas", async () => {
    const server = fakeSceneServer();
    const user = await startScene(server);
    const done = screen.getByRole("button", { name: "Terminé" });
    expect(done.getAttribute("aria-keyshortcuts")).toBe("Space Enter");
    await user.type(input(), "Hello!");
    done.focus();
    await user.keyboard("{Enter}");
    expect(server.sent.at(-1)).toEqual({ type: "turn.text", text: "Hello!" });
    // The turn comes back: Space on Terminé also closes it.
    await act(async () => { server.push(stateMsg("playerTurn", "waiting", 2)); });
    await user.type(input(), "I'm Nico.");
    screen.getByRole("button", { name: "Terminé" }).focus();
    await user.keyboard(" ");
    expect(server.sent.filter((m) => m.type === "turn.text")).toEqual([{ type: "turn.text", text: "Hello!" }, { type: "turn.text", text: "I'm Nico." }]);
  });

  test("vacío no manda nada y lo dice; fuera de turno tampoco", async () => {
    const server = fakeSceneServer();
    const user = await startScene(server);
    await user.click(screen.getByRole("button", { name: "Terminé" }));
    expect(server.sent.some((m) => m.type === "turn.text")).toBe(false);
    expect(gameStore.getState().ui.announcement?.key).toBe("announce.emptyTurn");
    await act(async () => { server.push(stateMsg("npcTurn", null, 1)); });
    expect(screen.getByText("Esperá: ahora habla Inés Calder.")).toBeTruthy();
    fireEvent.change(input(), { target: { value: "Hello" } });
    await user.click(screen.getByRole("button", { name: "Terminé" }));
    expect(server.sent.some((m) => m.type === "turn.text")).toBe(false);
  });

  test("Pasar el turno abre las 4 opciones; Repetir relee la última línea; Más simple se manda", async () => {
    const server = fakeSceneServer();
    const user = await startScene(server);
    await user.click(screen.getByRole("button", { name: "Pasar el turno" }));
    expect(server.sent.at(-1)).toEqual({ type: "turn.pass" });
    await act(async () => { server.push(stateMsg("playerTurn", "passMenu")); });
    const menu = screen.getByRole("group", { name: "Pasar el turno" });
    // Plan estetica-c M4: the order of the scaffolding bar from proposal C §8 (Repetir · Más despacio · Pista).
    expect(within(menu).getAllByRole("button").map((b) => b.textContent)).toEqual(["Repetir", "Más simple", "Pista", "Seguí vos"]);
    await user.click(within(menu).getByRole("button", { name: "Repetir" }));
    expect(server.sent.at(-1)).toEqual({ type: "turn.choose", option: "repeat" });
    expect(screen.getByRole("status").textContent).toBe("Hello! Welcome to Kestrel Valley.");
    await act(async () => { server.push(stateMsg("playerTurn", "passMenu")); });
    await user.click(screen.getByRole("button", { name: "Más simple" }));
    expect(server.sent.at(-1)).toEqual({ type: "turn.choose", option: "simpler" });
  });
});

describe("A1: el chip de pista respeta el ajuste (D-035)", () => {
  test("prendido: aparece a los 10 s de silencio en tu turno, no antes; escribir lo saca; tocarlo abre Pasar el turno", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const server = fakeSceneServer();
    await startScene(server);
    await act(async () => { vi.advanceTimersByTime(9_900); });
    expect(screen.queryByRole("button", { name: "¿Querés una pista?" })).toBeNull();
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(screen.getByRole("button", { name: "¿Querés una pista?" })).toBeTruthy();
    fireEvent.change(input(), { target: { value: "Hel" } });
    expect(screen.queryByRole("button", { name: "¿Querés una pista?" })).toBeNull();
    fireEvent.change(input(), { target: { value: "" } });
    await act(async () => { vi.advanceTimersByTime(10_100); });
    fireEvent.click(screen.getByRole("button", { name: "¿Querés una pista?" }));
    expect(server.sent.at(-1)).toEqual({ type: "turn.pass" });
  });

  test("apagado en Ajustes: no aparece nunca", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const server = fakeSceneServer();
    act(() => { actions.setHintChip(false); });
    await startScene(server);
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(screen.queryByRole("button", { name: "¿Querés una pista?" })).toBeNull();
  });

  test("fuera de `waiting` (habla el NPC) no corre", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const server = fakeSceneServer();
    await startScene(server);
    await act(async () => { server.push(stateMsg("npcTurn", null, 1)); });
    await act(async () => { vi.advanceTimersByTime(20_000); });
    expect(screen.queryByRole("button", { name: "¿Querés una pista?" })).toBeNull();
  });

  test("el ajuste está en Ajustes › Conversación y se anuncia", async () => {
    await act(async () => { stop = await bootApp({ webgl2: false }); });
    render(<App />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Ajustes" }));
    const toggle = screen.getByRole("checkbox", { name: "Chip de pista a los 10 segundos" }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    await user.click(toggle);
    expect(gameStore.getState().settings.input.hintChip).toBe(false);
    expect(screen.getByRole("status").textContent).toBe("Chip de pista desactivado.");
  });
});

describe("A1: glosario según glossaryDisplay (D-131), sin traducción inventada (D-068)", () => {
  const GLOSSARY: Glossary = [
    { id: "gl.field.n", en: "field", es: "campo / lote", estado: "draft" },
    { id: "gl.key.n", en: "key", es: "llave", estado: "reviewed" },
    { id: "gl.welcome.phr", en: "welcome", es: "bienvenido/a", estado: "approved" },
  ];

  async function openWord(server: FakeSceneServer, user: ReturnType<typeof userEvent.setup>, word: string) {
    // The word of the LAST line (the opening also says "Welcome").
    const log = screen.getByRole("log");
    const last = within(log).getAllByRole("listitem").at(-1) as HTMLElement;
    await user.click(within(last).getByRole("button", { name: word }));
    return screen.getByRole("complementary", { name: word });
  }

  async function sceneWithLine(display: "dev" | "release" | "fv") {
    const server = fakeSceneServer();
    const user = await startScene(server, content(display, GLOSSARY));
    await vi.waitFor(() => expect(gameStore.getState().dialogue.lexicon.status).toBe("ready"));
    await act(async () => {
      server.push({ type: "npc.line", line: { lineId: "l-2", speaker: "NPC-INES", kind: "reply", text: "Welcome! This is the field. Here's your key.", template: null } });
    });
    return { server, user };
  }

  test("dev: draft y reviewed se muestran con la marca 'borrador'; approved sin marca", async () => {
    const { server, user } = await sceneWithLine("dev");
    const field = await openWord(server, user, "field");
    expect(field.textContent).toContain("field: campo / lote");
    expect(within(field).getByText("borrador")).toBeTruthy();
    await user.click(within(field).getByRole("button", { name: "Cerrar" }));
    const key = await openWord(server, user, "key");
    expect(key.textContent).toContain("key: llave");
    expect(within(key).getByText("borrador")).toBeTruthy();
    await user.keyboard("{Escape}");
    const welcome = await openWord(server, user, "Welcome");
    expect(welcome.textContent).toContain("bienvenido/a");
    expect(within(welcome).queryByText("borrador")).toBeNull();
  });

  test("release: solo approved; draft y reviewed no se muestran (se ofrece marcar, nunca una traducción)", async () => {
    const { server, user } = await sceneWithLine("release");
    const field = await openWord(server, user, "field");
    expect(field.textContent).not.toContain("campo");
    expect(within(field).getByText("Esta palabra no está en el glosario.")).toBeTruthy();
    expect(within(field).getByRole("button", { name: "Marcar para repasar" })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect((await openWord(server, user, "key")).textContent).not.toContain("llave");
    await user.keyboard("{Escape}");
    expect((await openWord(server, user, "Welcome")).textContent).toContain("bienvenido/a");
  });

  test("fv: approved + reviewed sin marca; draft oculto", async () => {
    const { server, user } = await sceneWithLine("fv");
    const key = await openWord(server, user, "key");
    expect(key.textContent).toContain("llave");
    expect(within(key).queryByText("borrador")).toBeNull();
    await user.keyboard("{Escape}");
    expect((await openWord(server, user, "field")).textContent).not.toContain("campo");
  });

  test("palabra fuera del glosario → Marcar para repasar; queda marcada y se anuncia; el foco vuelve a la palabra", async () => {
    const { server, user } = await sceneWithLine("dev");
    const card = await openWord(server, user, "This");
    expect(card.textContent).toContain("Esta palabra no está en el glosario.");
    await user.click(within(card).getByRole("button", { name: "Marcar para repasar" }));
    expect(gameStore.getState().learner.marked).toEqual(["this"]);
    expect(screen.getByRole("status").textContent).toBe("Marcaste \"this\" para repasar.");
    expect(document.activeElement?.textContent).toBe("This");
  });

  test("las palabras de una línea se recorren con las flechas (una sola parada de Tab por línea)", async () => {
    const { user } = await sceneWithLine("dev");
    const log = screen.getByRole("log");
    const words = within(log).getAllByRole("button").filter((b) => b.closest("li")?.textContent?.includes("This is the field"));
    expect(words.filter((w) => w.tabIndex === 0)).toHaveLength(1);
    words[0]?.focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(words[1]);
  });
});

describe("A2 en el HUD: corte y contención", () => {
  test("un turno cortado muestra la nota y la línea segura; la contención muestra la línea, el recurso y la marca de provisorio", async () => {
    const server = fakeSceneServer();
    await startScene(server);
    await act(async () => {
      server.push({ type: "scene.safety", layer: "input", action: "cut" });
      server.push({ type: "npc.line", line: { lineId: "s1", speaker: "NPC-INES", kind: "safe", text: "Hmm. Let's talk about something else.", template: null } });
    });
    expect(screen.getByText("Ese mensaje no se mandó.")).toBeTruthy();
    expect(screen.getByRole("log").textContent).toContain("Hmm. Let's talk about something else.");
    await act(async () => {
      server.push({ type: "scene.safety", layer: "input", action: "containment" });
      server.push({ type: "scene.containment", line: "Paramos la escena un momento.", resource: { label: "Ayuda", detail: "Pendiente de revisión." }, provisional: true });
      server.push(stateMsg("done", null, 1));
      server.push({ type: "scene.end", outcome: "containment", criteriaMet: [], evidence: [] });
    });
    const box = screen.getByRole("region", { name: "Paramos un momento" });
    expect(box.textContent).toContain("Paramos la escena un momento.");
    expect(box.textContent).toContain("Ayuda: Pendiente de revisión.");
    expect(box.textContent).toContain("Texto provisorio");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Volver" })).toBeTruthy();
  });

  test("un mensaje fuera del protocolo se descarta (no rompe el HUD)", async () => {
    const server = fakeSceneServer();
    await startScene(server);
    await act(async () => { server.push("{nope"); server.push(JSON.stringify({ type: "npc.line", line: { prompt: "x" } })); });
    expect(consoleWarn).toHaveBeenCalled();
    expect(screen.getByText("Tu turno. Tomate el tiempo que necesites.")).toBeTruthy();
  });

  test("NPC sin presentar: su línea guionada y la explicación, sin escena", async () => {
    const server = fakeSceneServer();
    await act(async () => { stop = await bootApp({ webgl2: false, scene: { connector: server.connector } }); });
    render(<App />);
    await act(async () => { actions.enterScene("NPC-NELL", null); await server.waitOpen(); });
    await act(async () => {
      server.push({ type: "npc.line", line: { lineId: "n1", speaker: "NPC-NELL", kind: "notIntroduced", text: "Hi! Do I know you?", template: null } });
      server.push({ type: "scene.blocked", npcId: "NPC-NELL", reason: "notIntroduced" });
    });
    expect(screen.getByRole("log").textContent).toContain("Hi! Do I know you?");
    expect(screen.getByText("Todavía no se conocen: alguien del valle te tiene que presentar.")).toBeTruthy();
  });
});

describe("A3: el mismo HUD en solo-diálogo y sobre el canvas", () => {
  test("mismo componente, mismos controles; sobre el mapa el shell deja pasar el puntero y el HUD lo recibe", async () => {
    const server = fakeSceneServer();
    await act(async () => { stop = await bootApp({ webgl2: true, scene: { connector: server.connector } }); });
    // Shell without App: the canvas (three) is not mounted in jsdom; the shell is what decides the surface.
    const { container } = render(<Shell />);
    const controls = () => {
      const hud = screen.getByTestId("dialogue-hud");
      return {
        surface: hud.getAttribute("data-surface"),
        tag: hud.tagName,
        names: within(hud).getAllByRole("button").map((b) => b.textContent),
        textbox: within(hud).getByRole("textbox", { name: "Tu respuesta (en inglés)" }) !== null,
      };
    };

    act(() => { actions.enterDialogOnly(); });
    await act(async () => { actions.enterScene("NPC-INES", null); await server.waitOpen(); });
    await act(async () => { for (const m of openingFor("NPC-INES")) server.push(m); });
    const dialogOnly = controls();
    expect(dialogOnly.surface).toBe("dialogOnly");

    act(() => { actions.leaveScene(); actions.enterWorld(); });
    await act(async () => { actions.enterScene("NPC-INES", null); await server.waitOpen(2); });
    await act(async () => { for (const m of openingFor("NPC-INES")) server.push(m); });
    const canvas = controls();
    expect(canvas.surface).toBe("canvas");
    expect({ ...canvas, surface: null }).toEqual({ ...dialogOnly, surface: null });
    // On top of the map: the shell is pointer-transparent and the HUD panel receives it.
    expect((container.firstElementChild as HTMLElement).className).toContain("pointer-events-none");
    expect(screen.getByTestId("dialogue-hud").className).toContain("pointer-events-auto");
  });
});

describe("M4 (estetica-c): HUD papel y tinta", () => {
  test("barra de andamiaje: Pasar el turno y Terminé (oscuro) a la derecha, al final; la palabra nueva sigue siendo un botón con Tab", async () => {
    const server = fakeSceneServer();
    const user = await startScene(server);
    const bar = screen.getByRole("group", { name: "Ayudas para tu turno" });
    const names = within(bar).getAllByRole("button").map((b) => b.getAttribute("id"));
    expect(names).toEqual(["scene-pass", "scene-done"]);
    const done = within(bar).getByRole("button", { name: "Terminé" });
    expect(done.className).toContain("bg-ink");
    expect(done.className).toContain("text-paper");
    expect(done.className).toContain("ml-auto");
    // The new word: underlined with dots and reachable by keyboard.
    const word = within(screen.getByRole("log")).getAllByRole("button")[0] as HTMLElement;
    expect(word.className).toContain("decoration-dotted");
    expect(word.tabIndex).toBe(0);
    await user.click(word);
    expect(screen.getByRole("complementary")).toBeTruthy();
  });

  test("chip ámbar del nombre y la línea del NPC más grande (en rem)", async () => {
    const server = fakeSceneServer();
    await startScene(server);
    const chip = screen.getByRole("heading", { level: 1, name: "Con Inés Calder" });
    expect(chip.className).toContain("bg-amber");
    expect(chip.className).toContain("text-on-amber");
    expect(chip.className).toContain("border-amber-strong");
    const npc = document.querySelector('[data-line="npc"]') as HTMLElement;
    expect(npc.className).toContain("text-[1.375rem]");
  });

  test("indicador de turno: punto verde que late en tu turno, gris cuando habla el NPC; quieto con reducir movimiento", async () => {
    const server = fakeSceneServer();
    await startScene(server);
    const dot = () => screen.getByTestId("turn-dot");
    expect(dot().getAttribute("data-dot")).toBe("turn");
    expect(dot().getAttribute("data-pulse")).toBe("true");
    expect(dot().className).toContain("lg-pulse");
    expect(dot().className).toContain("bg-turn");
    act(() => { actions.setReduceMotion(true); });
    expect(dot().getAttribute("data-pulse")).toBe("false");
    expect(dot().className).not.toContain("lg-pulse");
    await act(async () => { server.push(stateMsg("npcTurn", null, 1)); });
    expect(dot().getAttribute("data-dot")).toBe("speaking");
    expect(dot().getAttribute("data-pulse")).toBe("false");
    act(() => { actions.setReduceMotion(false); });
    expect(dot().getAttribute("data-pulse")).toBe("false"); // gray: never pulses
  });

  test("sobre el mapa: tarjeta de papel abajo al centro de hasta 47,5rem, alto 45dvh", async () => {
    const server = fakeSceneServer();
    await act(async () => { stop = await bootApp({ webgl2: true, scene: { connector: server.connector } }); });
    render(<Shell />);
    act(() => { actions.enterWorld(); });
    await act(async () => { actions.enterScene("NPC-INES", null); await server.waitOpen(); });
    const hud = screen.getByTestId("dialogue-hud");
    for (const c of ["fixed", "bottom-3", "mx-auto", "max-w-[47.5rem]", "max-h-[45dvh]", "rounded-card", "bg-paper", "shadow-card"]) expect(hud.className.split(" ")).toContain(c);
  });
});
