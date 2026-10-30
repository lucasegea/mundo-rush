// Raíz de composición (03 §4.2.1, P0 T1): monta el shell DOM y, solo en la fase `world`, el canvas por
// import() diferido (three nunca entra al chunk inicial, 03 §2.7.3). En solo-diálogo el canvas no se descarga.
// Los parámetros por tier (R12) bajan al mundo por props: world/ no importa services/.
// Open-world-3d T10 (d): con el menú arriba y quieto, el chunk 3D y los .glb de los árboles se precargan
// (boot/preload.ts); el import() del clic encuentra el chunk ya bajado.
import { lazy, Suspense, useEffect } from "react";
import { idlePreloader, shouldPreloadWorld, treePreloadUrls } from "./boot/preload";
import { TIER_PARAMS } from "./services/quality";
import { selectMainMenuView, selectPhase, selectShellView, useGameView } from "./state/selectors";
import { Shell } from "./ui";

const loadGameCanvas = () => import("./world/GameCanvas");
const GameCanvas = lazy(loadGameCanvas);

const worldPreload = idlePreloader([
  loadGameCanvas,
  ...treePreloadUrls(import.meta.env.BASE_URL).map((url) => () => fetch(url).then((r) => r.arrayBuffer())),
]);

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
