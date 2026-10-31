// @vitest-environment jsdom
// Plan estetica-c M3 (D-030): the dialog-only portrait uses the model's rendered PNG only if the id has it
// registered, and if it is missing or does not load it falls back to F1.3's SVG. The director-mode portrait panel (without three, the
// render function injected), the bust framing (pure) and the studio's development-only marker.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import studioSource from "../src/world/portraits/studio.ts?raw";
import panelSource from "../src/dev/portraits/index.ts?raw";
import { startPortraitPanel } from "../src/dev/portraits";
import { portraitImageUrl, Portrait, RENDERED_PORTRAITS } from "../src/ui/dialog-only/Portrait";
import { portraitFraming, PORTRAIT_FOV_DEG } from "../src/world/camera/portrait";

afterEach(cleanup);

describe("retrato de solo-diálogo", () => {
  test("sin PNG registrado sigue el SVG de F1.3 (hoy ningún id lo tiene)", () => {
    expect(RENDERED_PORTRAITS.size).toBe(0);
    expect(portraitImageUrl("NPC-NELL")).toBeNull();
    const { container } = render(<Portrait id="NPC-NELL" name="Nell" />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  test("con PNG registrado muestra la imagen; si no carga, cae al SVG", () => {
    const available = new Set(["NPC-NELL"]);
    expect(portraitImageUrl("NPC-NELL", available, "/")).toBe("/portraits/NPC-NELL.png");
    const { container } = render(<Portrait id="NPC-NELL" name="Nell" available={available} />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toMatch(/portraits\/NPC-NELL\.png$/);
    act(() => { fireEvent.error(img as HTMLImageElement); });
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  test("QA M3: un PNG que no cargó para un id no se hereda al cambiar de id (y al volver, sigue cayendo al SVG)", () => {
    const available = new Set(["NPC-NELL", "NPC-INES"]);
    const { container, rerender } = render(<Portrait id="NPC-NELL" name="Nell" available={available} />);
    act(() => { fireEvent.error(container.querySelector("img") as HTMLImageElement); });
    expect(container.querySelector("img")).toBeNull();
    // The same component moves to Inés: her PNG is tested (before it stayed on SVG forever).
    rerender(<Portrait id="NPC-INES" name="Inés" available={available} />);
    expect(container.querySelector("img")?.getAttribute("src")).toMatch(/portraits\/NPC-INES\.png$/);
    act(() => { fireEvent.error(container.querySelector("img") as HTMLImageElement); });
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

describe("panel de retratos (modo director)", () => {
  test("renderiza cada id con la función inyectada y ofrece bajar cada PNG; al desmontar libera las url", async () => {
    const made: string[] = [];
    const revoked: string[] = [];
    const stop = startPortraitPanel({
      ids: ["NPC-A", "NPC-B"],
      render: async (id) => (id === "NPC-B" ? Promise.reject(new Error("sin cuerpo")) : new Blob(["png"], { type: "image/png" })),
      mount: document.body,
      urls: { create: () => { made.push(`blob:${made.length}`); return made[made.length - 1] as string; }, revoke: (u) => revoked.push(u) },
    });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Renderizar" })); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const link = screen.getByRole("link", { name: "NPC-A.png" });
    expect(link.getAttribute("download")).toBe("NPC-A.png");
    expect(link.getAttribute("href")).toBe("blob:0");
    expect(screen.getByText(/NPC-B: sin cuerpo/)).toBeTruthy();
    stop();
    expect(document.querySelector("[data-lg-portraits]")).toBeNull();
    expect(revoked).toEqual(["blob:0"]);
  });

  test("el estudio y el panel llevan un marcador de solo-desarrollo (check:dev-only los caza si llegan a un build)", () => {
    // "__lg_director" is one of the DEV_ONLY_MARKERS of scripts/budgets/dev-only.ts.
    for (const src of [studioSource, panelSource]) expect(src).toContain("__lg_director");
    expect(panelSource).not.toMatch(/^import .*(three|world\/)/m);
  });
});

describe("encuadre de busto (puro)", () => {
  test("la cámara mira la cabeza de frente, apenas desde arriba, y el busto entra en el cuadro", () => {
    const f = portraitFraming([1, 2, 3], 0.46);
    expect(f.fovDeg).toBe(PORTRAIT_FOV_DEG);
    expect(f.position[0]).toBe(1);
    expect(f.position[2]).toBeGreaterThan(3);
    expect(f.position[1]).toBeGreaterThan(f.target[1]);
    const dist = Math.hypot(f.position[1] - f.target[1], f.position[2] - f.target[2]);
    const halfHeight = dist * Math.tan((PORTRAIT_FOV_DEG * Math.PI) / 360);
    expect(halfHeight).toBeGreaterThan(2 * 0.46); // whole head plus hat
    expect(halfHeight).toBeLessThan(5 * 0.46); // and not a wide shot
  });
});
