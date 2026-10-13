// @vitest-environment jsdom
// Plan estetica-c M3 (D-030): el retrato de solo-diálogo usa el PNG renderizado del modelo solo si el id lo tiene
// registrado, y si falta o no carga cae al SVG de F1.3. El panel de retratos del modo director (sin three, la función
// de render inyectada), el encuadre de busto (puro) y el marcador de solo-desarrollo del estudio.
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
    // "__lg_director" es uno de los DEV_ONLY_MARKERS de scripts/budgets/dev-only.ts.
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
    expect(halfHeight).toBeGreaterThan(2 * 0.46); // cabeza entera más sombrero
    expect(halfHeight).toBeLessThan(5 * 0.46); // y no un plano general
  });
});
