// HUD del mapa (F2, R14): vista del store, nunca del canvas (R3). El aviso "E para hablar" sale de
// `selectWorldHudView`, que lee los interactuables cercanos que calculó el núcleo. Todo lo que se hace con
// teclas tiene también un botón (accesibilidad: teclado completo y puntero, sin depender de un solo dispositivo).
import { t } from "../../i18n";
import { actions } from "../../state/actions";
import { selectWorldHudView, useGameView } from "../../state/selectors";
import { useFocusOnMount } from "../a11y/hooks";
import { Button } from "../primitives";

export function WorldHud() {
  const view = useGameView(selectWorldHudView);
  const heading = useFocusOnMount<HTMLHeadingElement>();
  return (
    // El HUD deja pasar el puntero al mapa; solo sus controles lo reciben.
    <section aria-labelledby="world-title" className="pointer-events-none flex min-h-[calc(100dvh-4rem)] flex-col justify-between gap-4 p-4">
      <div className="flex flex-col items-start gap-2">
        <h1 id="world-title" ref={heading} tabIndex={-1} className="sr-only">{t("world.title")}</h1>
        {view.mapStatus === "loading" || view.mapStatus === "idle" ? <p className="rounded-lg bg-surface px-3 py-2">{t("world.loading")}</p> : null}
        {view.mapStatus === "error" ? (
          <div className="pointer-events-auto flex flex-col items-start gap-2 rounded-lg bg-surface p-3">
            <p>{t("world.failed")}</p>
            <Button id="world-to-dialog-only" variant="primary" onClick={() => actions.enterDialogOnly()}>{t("world.toDialogOnly")}</Button>
          </div>
        ) : null}
        <p className="max-w-xl rounded-lg bg-surface/90 px-3 py-2 text-sm">{t("world.controls")}</p>
        <Button id="world-story" className="pointer-events-auto" onClick={() => actions.enterScene(null, "world-story")}>{t("world.continueStory")}</Button>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div role="status" aria-live="polite" className="flex flex-col items-start gap-2">
          {view.prompt ? (
            <>
              <p className="rounded-lg bg-surface px-3 py-2 font-semibold">{t("world.prompt.talk", { name: view.prompt.name })}</p>
              <Button id="world-talk" variant="primary" className="pointer-events-auto" onClick={() => actions.interact(view.prompt?.id ?? null)}>
                {t("world.talk", { name: view.prompt.name })}
              </Button>
            </>
          ) : null}
        </div>
        <div className="pointer-events-auto flex items-center gap-2 rounded-lg bg-surface/90 p-1">
          <Button id="world-zoom-out" aria-disabled={view.zoomStep === 0} onClick={() => actions.zoomOut()}>{t("world.zoomOut")}</Button>
          <span className="px-1 text-sm">{t("world.zoomLevel", { value: view.zoomStep + 1, total: view.zoomSteps })}</span>
          <Button id="world-zoom-in" aria-disabled={view.zoomStep === view.zoomSteps - 1} onClick={() => actions.zoomIn()}>{t("world.zoomIn")}</Button>
        </div>
      </div>
    </section>
  );
}
