// Raíz de composición (03 §4.2.1, P0 T1): monta el shell DOM y, solo en la fase `world`, el canvas por
// import() diferido (three nunca entra al chunk inicial, 03 §2.7.3). En solo-diálogo el canvas no se descarga.
// Los parámetros por tier (R12) bajan al mundo por props: world/ no importa services/.
// Open-world-3d T10 (d): con el menú arriba y quieto, el chunk 3D y los .glb de los árboles se precargan
// (boot/preload.ts); el import() del clic encuentra el chunk ya bajado. T10-integrate: también el chunk del post (si el
// tier lo dibuja), las rocas, los datos del mapa y los decodificadores, desde una sola lista (WORLD_PRELOAD).
import { lazy, Suspense, useEffect } from "react";
import { idlePreloader, shouldPreloadWorld, worldPreloadTasks } from "./boot/preload";
import { universeFromSearch } from "./services/content";
import { TIER_PARAMS } from "./services/quality";
import { readGame, selectMainMenuView, selectPhase, selectShellView, selectWorldRender, useGameView } from "./state/selectors";
import { Shell } from "./ui";

const loadGameCanvas = () => import("./world/GameCanvas");
const GameCanvas = lazy(loadGameCanvas);
// T10-integrate: el mismo módulo que GameCanvas carga con lazy() (Vite emite un solo chunk para los dos import()).
const loadPost = () => import("./world/post/Post");

/** ¿El tier de ahora dibuja postprocesado? (el mismo cálculo que GameCanvas: postLevel de render.post y del tier). */
const postWanted = (): boolean => readGame((s) => {
  const r = selectWorldRender(s);
  return r.post && TIER_PARAMS[r.tier].post !== "none";
});

// La lista se arma en el momento quieto (boot/preload.ts, WORLD_PRELOAD): lee el tier y el universo de ese momento.
const worldPreload = idlePreloader(() => worldPreloadTasks({
  baseUrl: import.meta.env.BASE_URL,
  universeId: universeFromSearch(globalThis.location?.search ?? ""),
  post: postWanted(),
  loadCanvas: loadGameCanvas,
  loadPost,
  fetchUrl: (url) => fetch(url).then((r) => r.arrayBuffer()),
}));

export function App() {
  const phase = useGameView(selectPhase);
  const menuOpen = useGameView((s) => selectShellView(s).panel?.kind === "mainMenu");
  const worldAvailable = useGameView((s) => selectMainMenuView(s).worldAvailable);
  const preload = shouldPreloadWorld({ phase, menuOpen, worldAvailable });
  useEffect(() => (preload ? worldPreload.schedule(globalThis) : undefined), [preload]);
  return (
    <>
      <Shell />
      {phase === "world" ? (
        <Suspense fallback={null}>
          <GameCanvas tierParams={TIER_PARAMS} />
        </Suspense>
      ) : null}
    </>
  );
}
