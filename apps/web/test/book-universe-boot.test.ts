// book-mode slice-1 M5 / AC10: boot-smoke headless (sin Playwright en vivo, project lesson 2026-10-08) del cliente
// con universeId=U-GALEANO. Arranca el boot real, entra al mapa y afirma que en la escena en runtime están el diorama
// de Potosí y el NPC de la conversación estratégica CONV-POTOSI. NO escribe a stores reales: plataforma en memoria,
// contenido servido en memoria (compilado del universo real) y sin servidor de escena. El testTimeout explícito lo fija
// el proyecto @lg/web (30 s, vitest.config.ts) para el arranque en frío del boot (lesson 2026-10-08).
import { afterEach, expect, test, vi } from "vitest";
import { actions } from "../src/state/actions";
import { gameStore } from "../src/state/store";
import { fakeSceneServer } from "./fake-scene";
import { bootApp, compiledClientContent, compiledUniverseClientContent, fetchFromContent, resetStore } from "./helpers";

const UNIVERSE = "U-GALEANO";
// El diorama del primer lugar de la región R1 (campos.cerro = el Cerro Rico): el que el boot elige por dato, no por un
// mapa universo→diorama cableado. Confirmado contra content/universes/U-GALEANO/ (world/places.yaml, dioramas/).
const POTOSI_DIORAMA = "muelle";
// El NPC de CONV-POTOSI (= CONV-C1 "whose cow, whose milk?"), el contador de la corona. Existe en U-GALEANO.
const CONV_NPC = "NPC-FACTOR";

let stop: () => void = () => {};
afterEach(() => {
  vi.restoreAllMocks();
  stop();
  resetStore();
});

test("boot con universeId=U-GALEANO carga el diorama de Potosí y el NPC de CONV-POTOSI (AC10)", async () => {
  stop = await bootApp({ webgl2: true, universeId: UNIVERSE, fetchJson: fetchFromContent(compiledUniverseClientContent(UNIVERSE)) });

  // El catálogo del universo carga desde el namespace U-GALEANO (lugares/npcs), no desde el árbol campesino.
  await vi.waitFor(() => expect(gameStore.getState().world.catalog).toBe("ready"));
  expect(gameStore.getState().world.regionName).toContain("Potosí");

  // Entrar al mapa dispara la carga del diorama de arranque del universo.
  actions.enterWorld();
  await vi.waitFor(() => expect(gameStore.getState().world.dioramaStatus).toBe("ready"));

  const world = gameStore.getState().world;
  // El diorama de Potosí está en la escena en runtime (layout preparado por el núcleo: grilla, spawn, capas).
  expect(world.diorama?.id).toBe(POTOSI_DIORAMA);
  // El NPC de la conversación estratégica está en la escena en runtime (catálogo del universo).
  expect(world.npcs.map((n) => n.id)).toContain(CONV_NPC);
});

// M6.3 / T7 (D-814, AC11): el id de universo llega a todo servicio de cliente. Se abre una escena (NPC-CERRO) y se
// espían TODAS las URLs de contenido: las del universo cuelgan de content/U-GALEANO/, ninguna va al árbol legacy; y sin
// universo las URLs legacy quedan idénticas.
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
  await vi.waitFor(() => expect(gameStore.getState().dialogue.lexicon.status).toBe("ready"));
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
