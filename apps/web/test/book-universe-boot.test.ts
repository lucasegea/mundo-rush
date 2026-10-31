// book-mode slice-1 M5 / AC10: headless boot-smoke (no live Playwright, project lesson 2026-10-08) of the client
// with universeId=U-GALEANO. Starts the real boot, enters the map and asserts that the runtime scene holds the Potosí
// diorama and the NPC of the strategic conversation CONV-POTOSI. It does NOT write to real stores: in-memory platform,
// content served in memory (compiled from the real universe) and no scene server. The explicit testTimeout is set by
// the @lg/web project (30 s, vitest.config.ts) for the boot's cold start (lesson 2026-10-08).
import { afterEach, expect, test, vi } from "vitest";
import { actions } from "../src/state/actions";
import { gameStore } from "../src/state/store";
import { fakeSceneServer } from "./fake-scene";
import { bootApp, compiledClientContent, compiledUniverseClientContent, fetchFromContent, resetStore } from "./helpers";

const UNIVERSE = "U-GALEANO";
// The diorama of the first place of region R1 (campos.cerro = el Cerro Rico): the one boot picks by data, not by a
// hardwired universe→diorama map. Confirmed against content/universes/U-GALEANO/ (world/places.yaml, dioramas/).
const POTOSI_DIORAMA = "muelle";
// CONV-POTOSI's NPC (= CONV-C1 "whose cow, whose milk?"), the crown's accountant. It exists in U-GALEANO.
const CONV_NPC = "NPC-FACTOR";

let stop: () => void = () => {};
afterEach(() => {
  vi.restoreAllMocks();
  stop();
  resetStore();
});

test("boot con universeId=U-GALEANO carga el diorama de Potosí y el NPC de CONV-POTOSI (AC10)", async () => {
  stop = await bootApp({ webgl2: true, universeId: UNIVERSE, fetchJson: fetchFromContent(compiledUniverseClientContent(UNIVERSE)) });

  // The universe's catalog loads from the U-GALEANO namespace (places/npcs), not from the farmer tree.
  await vi.waitFor(() => expect(gameStore.getState().world.catalog).toBe("ready"));
  expect(gameStore.getState().world.regionName).toContain("Potosí");

  // Entering the map triggers the loading of the universe's starting diorama.
  actions.enterWorld();
  await vi.waitFor(() => expect(gameStore.getState().world.dioramaStatus).toBe("ready"));

  const world = gameStore.getState().world;
  // The Potosí diorama is in the runtime scene (layout prepared by the core: grid, spawn, layers).
  expect(world.diorama?.id).toBe(POTOSI_DIORAMA);
  // The strategic conversation's NPC is in the runtime scene (universe catalog).
  expect(world.npcs.map((n) => n.id)).toContain(CONV_NPC);
});

// M6.3 / T7 (D-814, AC11): the universe id reaches every client service. A scene is opened (NPC-CERRO) and ALL
// content URLs are spied on: the universe's hang under content/U-GALEANO/, none goes to the legacy tree; and without a
// universe the legacy URLs stay identical.
const SPIED_LEXICON = ["manifiesto.json", "glosario.json", "lumi.json"];

async function lexiconUrlsOnSceneOpen(universeId: string | undefined, content: Record<string, unknown>): Promise<string[]> {
  const urls: string[] = [];
  const base = fetchFromContent(content);
  const server = fakeSceneServer();
  stop = await bootApp({
    webgl2: true, ...(universeId ? { universeId } : {}), scene: { connector: server.connector },
    fetchJson: (url) => { urls.push(url); return base(url); },
  });
  await vi.waitFor(() => expect(gameStore.getState().world.catalog).toBe("ready"));
  actions.enterScene("NPC-CERRO", null);
  // Recorded change (open-world-3d T3, lesson F4.2): the wait cap goes from vi.waitFor's default 1 s to 10 s;
  // the assertion does not change. With the whole suite in parallel the cold import of the lexicon once went past a second.
  await vi.waitFor(() => expect(gameStore.getState().dialogue.lexicon.status).toBe("ready"), { timeout: 10_000 });
  return urls;
}

test("AC11: con universeId=U-GALEANO toda URL de contenido cuelga de content/U-GALEANO/ (glosario, manifiesto, Lumi incluidos)", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const urls = await lexiconUrlsOnSceneOpen(UNIVERSE, compiledUniverseClientContent(UNIVERSE));
  for (const f of SPIED_LEXICON) expect(urls).toContain(`/content/${UNIVERSE}/${f}`);
  expect(urls.length).toBeGreaterThan(3);
  for (const u of urls) expect(u.startsWith(`/content/${UNIVERSE}/`)).toBe(true);
  for (const f of SPIED_LEXICON) expect(urls).not.toContain(`/content/${f}`);
});

test("AC11: sin universo las URLs del léxico son las legacy, sin cambios", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const urls = await lexiconUrlsOnSceneOpen(undefined, compiledClientContent());
  for (const f of SPIED_LEXICON) expect(urls).toContain(`/content/${f}`);
  expect(urls.some((u) => u.includes("/U-"))).toBe(false);
});
