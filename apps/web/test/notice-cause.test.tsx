// @vitest-environment jsdom
// open-world-3d T1 (AC4): el HUD de diálogo muestra por qué el NPC no pudo contestar. Con causa: la frase de su kind
// (y el estado HTTP cuando lo hay); sin causa: el texto de hoy, exacto y solo.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { NoticeCause, ServerMessage } from "@lg/protocol";
import { App } from "../src/App";
import { actions } from "../src/state/actions";
import { fakeSceneServer, type FakeSceneServer } from "./fake-scene";
import { bootApp, resetStore } from "./helpers";

const TODAY = "El vecino no pudo contestar ahora (el modelo no está disponible). Podés seguir escribiendo o salir.";
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

const st = (state: string, sub: string | null): ServerMessage =>
  ({ type: "scene.state", state, sub, modality: "text", turnIndex: 0, softCapReached: false }) as ServerMessage;

async function openTextScene(server: FakeSceneServer): Promise<void> {
  await act(async () => {
    stop = await bootApp({ webgl2: false, scene: { connector: server.connector } });
  });
  render(<App />);
  await act(async () => {
    actions.enterScene("NPC-INES", null);
    await server.waitOpen();
  });
  await act(async () => { await vi.waitFor(() => expect(server.sent.length).toBeGreaterThan(0)); });
  await act(async () => {
    server.push({ type: "scene.opened", sceneRunId: "run-1", missionId: "M0.1", sceneId: "M0.1-E1", npcId: "NPC-INES", modality: "text" });
    server.push(st("playerTurn", "waiting"));
  });
}

async function noticeWith(cause: NoticeCause | null): Promise<{ notice: string; cause: string | null }> {
  const server = fakeSceneServer();
  await openTextScene(server);
  const msg: ServerMessage = cause
    ? { type: "scene.notice", code: "model_unavailable", message: "x", cause }
    : { type: "scene.notice", code: "model_unavailable", message: "x" };
  await act(async () => { server.push(msg); });
  const notice = screen.getByText(TODAY).textContent ?? "";
  const causeText = screen.queryByTestId("notice-cause")?.textContent ?? null;
  stop?.();
  stop = null;
  cleanup();
  resetStore();
  return { notice, cause: causeText };
}

describe("AC4: la causa del model_unavailable en el HUD", () => {
  test("{http, 402}: el texto de hoy y la frase http con 402", async () => {
    const r = await noticeWith({ kind: "http", status: 402 });
    expect(r.notice).toBe(TODAY);
    expect(r.cause).toBe("Falló el pedido al proveedor del modelo (HTTP 402).");
    expect(r.cause).toContain("402");
  });

  test("sin causa: el texto de hoy exacto y nada más", async () => {
    const r = await noticeWith(null);
    expect(r.notice).toBe(TODAY);
    expect(r.cause).toBeNull();
  });

  test("{timeout, null}: su frase, sin número", async () => {
    const r = await noticeWith({ kind: "timeout", status: null });
    expect(r.cause).toBe("El proveedor del modelo tardó demasiado en contestar.");
    expect(r.cause).not.toMatch(/\d/);
  });

  test("{http, null}: la frase http sin número y sin null ni undefined", async () => {
    const r = await noticeWith({ kind: "http", status: null });
    expect(r.cause).toBe("Falló el pedido al proveedor del modelo.");
    expect(r.cause).not.toMatch(/\d|null|undefined/);
  });
});
