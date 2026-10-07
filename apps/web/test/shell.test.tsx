// @vitest-environment jsdom
// A1 (Testing Library): recorrido del menú solo con teclado, ajustes que persisten en el store, aria-live que
// anuncia cambios. La app arranca con boot() real, un navegador simulado y el contenido real compilado.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "../src/App";
import { gameStore } from "../src/state/store";
import { bootApp, memoryPlatform, resetStore } from "./helpers";

// jsdom no tiene WebGL ni ResizeObserver: el canvas de R3F no se monta acá (el mundo se prueba con funciones puras
// y el store; el operador lo camina en el navegador). El shell no depende de lo que dibuje el canvas.
vi.mock("../src/world/GameCanvas", () => ({ default: () => null }));

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetStore();
  consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
  cleanup();
  // A9: cero errores de consola en cada recorrido (incluye warnings de act() de React).
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

    // El foco arranca en el primer ítem.
    expect(document.activeElement).toBe(world);
    await user.tab();
    expect(document.activeElement).toBe(dialogOnly);
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(settings);
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(close);
    await user.keyboard("{ArrowDown}"); // da la vuelta
    expect(document.activeElement).toBe(world);
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(document.activeElement).toBe(settings);

    // Enter abre Ajustes y el foco va al título.
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1, name: "Ajustes" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("slider", { name: "Tamaño del texto" }));

    // Escape vuelve al menú con el foco en "Ajustes".
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Ajustes" }));

    // Escape cierra el menú: queda la vista del mapa (placeholder hasta F2) con su título enfocado.
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("navigation", { name: "Menú principal" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1, name: "El mapa" }));
    expect(gameStore.getState().session.phase).toBe("world");

    // Desde la barra (antes de <main> en el orden de foco): Shift+Tab dos veces llega a "Menú"; Enter abre el
    // menú; Escape devuelve el foco al botón de la barra.
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
    // jsdom no implementa el paso con flechas de <input type="range"> (lo hace el navegador): se simula el
    // cambio que produce la flecha. El resto del recorrido es teclado real.
    slider.focus();
    fireEvent.change(slider, { target: { value: "2" } });
    expect(gameStore.getState().settings.accessibility.textScale).toBe(150);
    expect(slider.getAttribute("aria-valuetext")).toBe("150 %");
    expect(document.documentElement.style.getPropertyValue("--lg-font-scale")).toBe("1.5");

    await user.tab(); // alto contraste
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

    // Salir y volver a entrar: los valores siguen (vienen del store).
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Ajustes" }));
    expect((screen.getByRole("checkbox", { name: "Alto contraste" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "Natural" }) as HTMLInputElement).checked).toBe(true);

    // Copia local por la interfaz Platform (sin la sugerencia de tier).
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
    expect(status().firstElementChild).not.toBe(before); // nodo nuevo: el lector lo vuelve a leer
    stop();
  });
});
