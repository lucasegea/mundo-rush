// @vitest-environment jsdom
// Plan estetica-c M4 (HUD "paper and ink", proposal C §8): the map HUD (objective with an amber dot top
// left, help bottom left, prompt bottom center, quality bottom right in development only; on
// narrow screens help and quality are hidden), the help that disappears in conversation, and the "everything in
// rem" rule: in the components M4 touches no px sizes remain (except borders and radii, which are not in these files).
// What is read from tokens.css (radius, typography, reduce motion) is tested in scripts/a11y/contrast.test.ts, which
// reads the real file (in this vitest project imported CSS arrives empty).
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import dialogueSource from "../src/ui/dialogue/DialogueHud.tsx?raw";
import conversationSource from "../src/ui/dialogue/ConversationPanel.tsx?raw";
import worldSource from "../src/ui/hud/WorldHud.tsx?raw";
import buttonSource from "../src/ui/primitives/Button.tsx?raw";
import { actions } from "../src/state/actions";
import { Shell } from "../src/ui/shell/Shell";
import { WorldHud } from "../src/ui/hud/WorldHud";
import { fakeSceneServer } from "./fake-scene";
import { bootApp, resetStore } from "./helpers";

let stop: (() => void) | null = null;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetStore();
  consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
  stop?.();
  stop = null;
  cleanup();
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

/** The code without comments (comments may cite the proposal's px measurements). */
const code = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
const PX = /\b\d+(?:\.\d+)?px\b/g;

describe("todo texto en rem (subir el texto al 200 % escala el HUD entero)", () => {
  const files = { DialogueHud: dialogueSource, ConversationPanel: conversationSource, WorldHud: worldSource, Button: buttonSource };

  test("los componentes tocados no tienen tamaños en px", () => {
    for (const [name, src] of Object.entries(files)) {
      expect(src.length, name).toBeGreaterThan(500); // guard against a measured 0
      expect(code(src).match(PX) ?? [], name).toEqual([]);
    }
  });

  test("dientes: un tamaño en px metido en un componente se detecta", () => {
    expect(code(dialogueSource.replace("max-w-[47.5rem]", "max-w-[760px]")).match(PX)).toEqual(["760px"]);
    // ...but not if it is in a comment.
    expect(code("// la propuesta pide 22 px y 760px\nconst a = 1;").match(PX)).toBeNull();
  });
});

describe("HUD del mapa", () => {
  async function world() {
    await act(async () => { stop = await bootApp({ webgl2: true }); });
    act(() => { actions.enterWorld(); });
    render(<WorldHud />);
  }

  test("objetivo en una línea con punto ámbar arriba; ayuda abajo a la izquierda; ambas ocultas o visibles según el ancho", async () => {
    await world();
    const objective = screen.getByTestId("world-objective");
    expect(objective.textContent).toBe("Seguir la historia");
    expect(screen.getByRole("button", { name: "Seguir la historia" })).toBe(objective);
    expect(objective.className).toContain("whitespace-nowrap");
    expect((objective.querySelector('[aria-hidden="true"]') as HTMLElement).className).toContain("bg-amber");
    const help = screen.getByTestId("world-controls");
    expect(help.textContent).toContain("WASD");
    // Narrow screens (390 px): help is hidden; from md it shows.
    expect(help.className.split(" ")).toEqual(expect.arrayContaining(["hidden", "md:block"]));
  });

  test("calidad abajo a la derecha solo en desarrollo, oculta en pantallas angostas (los FPS son M6)", async () => {
    await world();
    expect(import.meta.env.DEV).toBe(true);
    const quality = screen.getByTestId("world-quality");
    expect(quality.textContent).toMatch(/^Calidad: (Baja|Media|Alta)$/);
    expect(quality.className.split(" ")).toEqual(expect.arrayContaining(["hidden", "md:inline-flex"]));
    expect(worldSource).toMatch(/import\.meta\.env\.DEV \? \(\s*<p data-testid="world-quality"/);
  });

  test("en la charla la ayuda de controles desaparece (el shell muestra el HUD de diálogo)", async () => {
    const server = fakeSceneServer();
    await act(async () => { stop = await bootApp({ webgl2: true, scene: { connector: server.connector } }); });
    render(<Shell />);
    act(() => { actions.enterWorld(); });
    expect(screen.getByTestId("world-controls")).toBeTruthy();
    await act(async () => { actions.enterScene("NPC-INES", null); await server.waitOpen(); });
    expect(screen.queryByTestId("world-controls")).toBeNull();
    expect(within(screen.getByTestId("dialogue-hud")).getByRole("heading", { level: 1 })).toBeTruthy();
  });
});
