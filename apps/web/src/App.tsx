// Raíz de composición (03 §4.2.1, P0 T1): monta el shell DOM y, solo en la fase `world`, el canvas por
// import() diferido (three nunca entra al chunk inicial, 03 §2.7.3). En solo-diálogo el canvas no se descarga.
// Los parámetros por tier (R12) bajan al mundo por props: world/ no importa services/.
import { lazy, Suspense } from "react";
import { TIER_PARAMS } from "./services/quality";
import { selectPhase, useGameView } from "./state/selectors";
import { Shell } from "./ui";

const GameCanvas = lazy(() => import("./world/GameCanvas"));

export function App() {
  const phase = useGameView(selectPhase);
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
