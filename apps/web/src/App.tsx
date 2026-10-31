// Composition root (03 §4.2.1, P0 T1): mounts the DOM shell and, only in the `world` phase, the canvas via
// deferred import() (three never enters the initial chunk, 03 §2.7.3). In dialog-only mode the canvas is not downloaded.
// The per-tier parameters (R12) reach the world through props: world/ does not import services/.
// Open-world-3d T10 (d): with the menu up and idle, the 3D chunk and the tree .glb files are preloaded
// (boot/preload.ts); the click's import() finds the chunk already downloaded. T10-integrate: also the post chunk (if the
// tier draws it), the rocks, the map data and the decoders, all from a single list (WORLD_PRELOAD).
import { lazy, Suspense, useEffect } from "react";
import { idlePreloader, shouldPreloadWorld, worldPreloadTasks } from "./boot/preload";
import { universeFromSearch } from "./services/content";
import { TIER_PARAMS } from "./services/quality";
import { readGame, selectMainMenuView, selectPhase, selectShellView, selectWorldRender, useGameView } from "./state/selectors";
import { Shell } from "./ui";

const loadGameCanvas = () => import("./world/GameCanvas");
const GameCanvas = lazy(loadGameCanvas);
// T10-integrate: the same module GameCanvas loads with lazy() (Vite emits a single chunk for both import() calls).
const loadPost = () => import("./world/post/Post");

/** Does the current tier draw post-processing? (the same calculation as GameCanvas: postLevel from render.post and the tier). */
const postWanted = (): boolean => readGame((s) => {
  const r = selectWorldRender(s);
  return r.post && TIER_PARAMS[r.tier].post !== "none";
});

// The list is built at the idle moment (boot/preload.ts, WORLD_PRELOAD): it reads the tier and universe of that moment.
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
