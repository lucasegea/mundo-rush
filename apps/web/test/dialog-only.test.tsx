// @vitest-environment jsdom
// A3 (sin WebGL simulado el arranque cae en solo-diálogo) + A9 (el shell carga el contenido REAL compilado de
// F1.2 sin errores de consola) + recorrido por teclado de lugares → NPC → "entrar a la escena".
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "../src/App";
import { gameStore } from "../src/state/store";
import { bootApp, compiledClientContent, fetchFromContent, resetStore } from "./helpers";

let consoleError: ReturnType<typeof vi.spyOn>;
let consoleWarn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetStore();
  consoleError = vi.spyOn(console, "error");
  consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
  consoleWarn.mockRestore();
});

async function startWithoutWebgl(fetchJson = fetchFromContent(compiledClientContent())) {
  await act(async () => { await bootApp({ webgl2: false, fetchJson }); });
  render(<App />);
  return userEvent.setup();
}

describe("A3: sin WebGL el arranque cae en solo-diálogo", () => {
  test("fase dialogOnly, sin menú encima, aviso visible y anunciado", async () => {
    await startWithoutWebgl();
    expect(gameStore.getState().session.phase).toBe("dialogOnly");
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1, name: "Modo solo diálogo" }));
    expect(screen.getAllByText("Sin WebGL en este navegador: se juega en modo solo diálogo.").length).toBeGreaterThan(0);
    expect(screen.getByRole("status").textContent).toBe("Este navegador no tiene WebGL: vas a jugar en modo solo diálogo.");
  });

  test("el mapa no se ofrece: el menú lo marca como no disponible y lo explica", async () => {
    const user = await startWithoutWebgl();
    await user.click(screen.getByRole("button", { name: "Menú" }));
    const world = screen.getByRole("button", { name: "Jugar en el mapa" });
    expect(world.getAttribute("aria-disabled")).toBe("true");
    await user.click(world);
    expect(gameStore.getState().session.phase).toBe("dialogOnly");
    expect(screen.getByRole("status").textContent).toBe("El mapa no está disponible sin WebGL.");
  });
});

describe("A9: el shell solo-diálogo carga el contenido compilado de F1.2", () => {
  test("lugares de la Región 1 y NPCs del prólogo, con retrato SVG", async () => {
    const content = compiledClientContent();
    const user = await startWithoutWebgl(fetchFromContent(content));
    const places = screen.getByRole("navigation", { name: "Lugares" });
    expect(within(places).getByText("Región 1: Los Campos y El Cruce")).toBeTruthy();
    const lugares = (content["lugares.json"] as { lugares: unknown[] }).lugares;
    expect(within(places).getAllByRole("button")).toHaveLength(lugares.length);

    // Inés está en la parada del colectivo (content/npcs/NPC-INES.yaml).
    const parada = within(places).getByRole("button", { name: /Parada del colectivo/ });
    expect(parada.getAttribute("aria-pressed")).toBe("false");
    parada.focus();
    await user.keyboard("{Enter}");
    expect(parada.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { level: 2, name: "Parada del colectivo" })).toBeTruthy();
    expect(screen.getByText("Cartel: Welcome to Kestrel Valley")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Retrato de Inés Calder" }).tagName.toLowerCase()).toBe("svg");

    // "Entrar a la escena" (placeholder) y vuelta con Escape: el foco vuelve al botón.
    const talk = screen.getByRole("button", { name: "Hablar con Inés Calder" });
    talk.focus();
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1, name: "Con Inés Calder" }));
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Hablar con Inés Calder" }));
  });

  test("un lugar sin nadie lo dice", async () => {
    const user = await startWithoutWebgl();
    await user.click(screen.getByRole("button", { name: /Tu cucheta/ }));
    expect(screen.getByText("Ahora no hay nadie en este lugar.")).toBeTruthy();
  });

  test("si el contenido no carga, falla claro (alerta + aria-live), sin lugares inventados", async () => {
    await startWithoutWebgl(() => Promise.reject(new Error("404")));
    expect(screen.getByRole("alert").textContent).toBe("No pudimos cargar los lugares. Probá recargar la página.");
    expect(screen.queryByRole("navigation", { name: "Lugares" })).toBeNull();
    expect(gameStore.getState().world.catalog).toBe("error");
    expect(consoleWarn).toHaveBeenCalledTimes(1);
  });
});
