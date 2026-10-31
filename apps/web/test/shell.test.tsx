// @vitest-environment jsdom
// A1 (Testing Library): keyboard-only menu walkthrough, settings that persist in the store, aria-live that
// announces changes. The app starts with the real boot(), a simulated browser and the real compiled content.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "../src/App";
import { gameStore } from "../src/state/store";
import { bootApp, memoryPlatform, resetStore } from "./helpers";

// jsdom has neither WebGL nor ResizeObserver: the R3F canvas is not mounted here (the world is tested with pure functions
// and the store; the operator walks it in the browser). The shell does not depend on what the canvas draws.
vi.mock("../src/world/GameCanvas", () => ({ default: () => null }));

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetStore();
  consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
  cleanup();
  // A9: zero console errors in each walkthrough (includes React act() warnings).
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

const status = () => screen.getByRole("status");

async function startWithWebgl(platform = memoryPlatform()) {
  let stop: () => void = () => {};
  await act(async () => { stop = await bootApp({ webgl2: true, platform }); });
  render(<App />);
  return { user: userEvent.setup(), stop, platform };
}

describe("A1: menú principal solo con teclado", () => {
  test("Tab, flechas, Enter y Escape recorren menú y ajustes; el foco vuelve a quien abrió", async () => {
    const { user, stop } = await startWithWebgl();
    const nav = screen.getByRole("navigation", { name: "Menú principal" });
    const world = within(nav).getByRole("button", { name: "Jugar en el mapa" });
    const dialogOnly = within(nav).getByRole("button", { name: "Jugar en modo solo diálogo" });
    const settings = within(nav).getByRole("button", { name: "Ajustes" });
    const close = within(nav).getByRole("button", { name: "Cerrar el menú" });

    // Focus starts on the first item.
    expect(document.activeElement).toBe(world);
    await user.tab();
    expect(document.activeElement).toBe(dialogOnly);
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(settings);
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(close);
    await user.keyboard("{ArrowDown}"); // wraps around
    expect(document.activeElement).toBe(world);
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(document.activeElement).toBe(settings);

    // Enter opens Ajustes and focus goes to the title.
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1, name: "Ajustes" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("slider", { name: "Tamaño del texto" }));

    // Escape returns to the menu with focus on "Ajustes".
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Ajustes" }));

    // Escape closes the menu: the map view remains (placeholder until F2) with its title focused.
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("navigation", { name: "Menú principal" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1, name: "El mapa" }));
    expect(gameStore.getState().session.phase).toBe("world");

    // From the bar (before <main> in focus order): Shift+Tab twice reaches "Menú"; Enter opens the
    // menu; Escape returns focus to the bar button.
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Ajustes" }));
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Menú" }));
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Jugar en el mapa" }));
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Menú" }));
    stop();
  });

  test("objetivos táctiles ≥ 44 px: todos los botones llevan min-h-11 (D-047)", async () => {
    await startWithWebgl();
    for (const b of screen.getAllByRole("button")) expect(b.className).toContain("min-h-11");
  });
});

describe("A1: ajustes que persisten en el store (y en el dispositivo)", () => {
  test("cambiar tamaño de texto, contraste, velocidad y tier por teclado queda en el store", async () => {
    const { user, stop, platform } = await startWithWebgl();
    await user.click(screen.getByRole("button", { name: "Ajustes" }));

    const slider = screen.getByRole("slider", { name: "Tamaño del texto" });
    // jsdom does not implement arrow-key stepping of <input type="range"> (the browser does): the
    // change the arrow produces is simulated. The rest of the walkthrough is real keyboard.
    slider.focus();
    fireEvent.change(slider, { target: { value: "2" } });
    expect(gameStore.getState().settings.accessibility.textScale).toBe(150);
    expect(slider.getAttribute("aria-valuetext")).toBe("150 %");
    expect(document.documentElement.style.getPropertyValue("--lg-font-scale")).toBe("1.5");

    await user.tab(); // high contrast
    expect(document.activeElement).toBe(screen.getByRole("checkbox", { name: "Alto contraste" }));
    await user.keyboard(" ");
    expect(gameStore.getState().settings.accessibility.highContrast).toBe(true);
    expect(document.documentElement.dataset.contrast).toBe("high");

    await user.click(screen.getByRole("checkbox", { name: "Reducir movimiento" }));
    expect(document.documentElement.dataset.reduceMotion).toBe("true");
    await user.click(screen.getByRole("checkbox", { name: "Subtítulos" }));
    expect(gameStore.getState().settings.accessibility.subtitles).toBe(false);

    await user.click(screen.getByRole("radio", { name: "Natural" }));
    expect(gameStore.getState().settings.npcSpeed).toBe("natural");
    await user.click(screen.getByRole("radio", { name: "Solo marcar para después" }));
    expect(gameStore.getState().settings.feedbackMode).toBe("flagOnly");
    await user.click(screen.getByRole("radio", { name: "Baja" }));
    expect(gameStore.getState().settings.graphics.tier).toBe("low");

    // Leave and re-enter: the values remain (they come from the store).
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Ajustes" }));
    expect((screen.getByRole("checkbox", { name: "Alto contraste" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "Natural" }) as HTMLInputElement).checked).toBe(true);

    // Local copy through the Platform interface (without the tier suggestion).
    const saved = JSON.parse(platform.data.get("settings.v1") ?? "{}") as { accessibility: { textScale: number }; graphics: object };
    expect(saved.accessibility.textScale).toBe(150);
    expect(saved.graphics).toEqual({ tier: "low" });
    stop();
  });
});

describe("A1: aria-live anuncia cambios de estado", () => {
  test("arranque, cambio de ajuste y el mismo anuncio dos veces", async () => {
    const { user, stop } = await startWithWebgl();
    expect(status().getAttribute("aria-live")).toBe("polite");
    expect(status().textContent).toBe("Listo. Estás en el menú principal.");

    await user.click(screen.getByRole("button", { name: "Ajustes" }));
    await user.click(screen.getByRole("checkbox", { name: "Alto contraste" }));
    expect(status().textContent).toBe("Alto contraste activado.");
    await user.click(screen.getByRole("radio", { name: "Más lenta" }));
    expect(status().textContent).toBe("Velocidad de los vecinos: Más lenta.");
    await user.click(screen.getByRole("radio", { name: "Media" }));
    expect(status().textContent).toBe("Calidad gráfica: Media.");

    const before = status().firstElementChild;
    await user.click(screen.getByRole("checkbox", { name: "Alto contraste" }));
    await user.click(screen.getByRole("checkbox", { name: "Alto contraste" }));
    expect(status().textContent).toBe("Alto contraste activado.");
    expect(status().firstElementChild).not.toBe(before); // new node: the reader reads it again
    stop();
  });
});
