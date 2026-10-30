// HUD del mapa (F2, R14): vista del store, nunca del canvas (R3). El aviso "E Hablar con <nombre>" sale de
// `selectWorldHudView`, que lee los interactuables cercanos que calculó el núcleo. Todo lo que se hace con
// teclas tiene también un botón (accesibilidad: teclado completo y puntero, sin depender de un solo dispositivo).
// Plan estetica-c M4 (propuesta C §8, "papel y tinta"): arriba a la izquierda el objetivo en una línea con punto ámbar;
// abajo a la izquierda la ayuda de controles; abajo al centro el aviso; abajo a la derecha el zoom y, solo en
// desarrollo, el chip de calidad. En pantallas angostas se ocultan la ayuda y el chip. En la charla este HUD no se
// muestra (el shell pone el de diálogo), así que la ayuda desaparece sola. Open-world-3d T9: abajo a la derecha, debajo
// del zoom, el minimapa (ui/hud/Minimap.tsx), que por eso tampoco se ve en la charla.
import { t } from "../../i18n";
import { actions } from "../../state/actions";
import { selectWorldHudView, useGameView } from "../../state/selectors";
import { useFocusOnMount } from "../a11y/hooks";
import { Button } from "../primitives";
import { Minimap } from "./Minimap";

const CARD = "rounded-card border-2 border-card-line bg-paper shadow-card";

export function WorldHud() {
  const view = useGameView(selectWorldHudView);
  const heading = useFocusOnMount<HTMLHeadingElement>();
  return (
    // El HUD deja pasar el puntero al mapa; solo sus controles lo reciben.
    <section aria-labelledby="world-title" className="pointer-events-none flex min-h-[calc(100dvh-4rem)] flex-col justify-between gap-4 p-4">
      <div className="flex flex-col items-start gap-2">
        <h1 id="world-title" ref={heading} tabIndex={-1} className="sr-only">{t("world.title")}</h1>
        {view.mapStatus === "loading" || view.mapStatus === "idle" ? <p className={`${CARD} px-3 py-2`}>{t("world.loading")}</p> : null}
        {view.mapStatus === "error" ? (
          <div className={`pointer-events-auto flex flex-col items-start gap-2 p-3 ${CARD}`}>
            <p>{t("world.failed")}</p>
            <Button id="world-to-dialog-only" variant="primary" onClick={() => actions.enterDialogOnly()}>{t("world.toDialogOnly")}</Button>
          </div>
        ) : null}
        {/* El objetivo en una línea con punto ámbar. M4 SEAM: hoy el único objetivo es seguir la historia; el texto del
            objetivo de la misión en curso llega con el estado de misiones (M5) y reemplaza a este rótulo. */}
        <Button id="world-story" data-testid="world-objective" className={`pointer-events-auto max-w-full whitespace-nowrap ${CARD}`} onClick={() => actions.enterScene(null, "world-story")}>
          <span aria-hidden="true" className="inline-block h-3 w-3 shrink-0 rounded-full border-2 border-amber-strong bg-amber" />
          <span className="truncate">{t("world.continueStory")}</span>
        </Button>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        {/* Abajo a la izquierda: la ayuda de controles (oculta en pantallas angostas). */}
        <p data-testid="world-controls" className={`hidden max-w-[22rem] px-3 py-2 text-sm md:block ${CARD}`}>{t("world.controls")}</p>
        {/* Abajo al centro: a quién le va a responder la E. Sale de selectInteractionPrompt, el mismo selector que
            resalta al NPC en el mundo (plan estetica-c M1 ítem 15), así el nombre del aviso y el resaltado no difieren. */}
        <div role="status" aria-live="polite" className="col-start-2 flex justify-center">
          {view.prompt ? (
            <p id="world-prompt" className={`pointer-events-auto flex items-center gap-2 px-3 py-2 ${CARD}`}>
              <kbd className="rounded-md border-2 border-amber-strong bg-amber px-2 font-semibold text-on-amber">{t("world.prompt.key")}</kbd>{" "}
              <Button id="world-talk" variant="primary" onClick={() => actions.interact(view.prompt?.id ?? null)}>
                {t("world.talk", { name: view.prompt.name })}
              </Button>
            </p>
          ) : null}
        </div>
        {/* Open-world-3d T9: el minimapa va fijo abajo a la derecha; esta columna deja su alto libre debajo (7rem o
            10rem más 1rem de aire) para que el zoom quede encima y no lo tape. */}
        <div className="col-start-3 flex flex-col items-end gap-2 justify-self-end pb-[8rem] md:pb-[11rem]">
          {/* Abajo a la derecha, solo en desarrollo: la calidad efectiva. M4 SEAM: los FPS y los contadores de
              renderer.info llegan en M6 (instantánea del modo director); hasta entonces se leen en el navegador. */}
          {import.meta.env.DEV ? (
            <p data-testid="world-quality" className={`hidden px-2 py-1 text-xs text-ink-muted md:inline-flex ${CARD}`}>
              {t("world.quality", { tier: t(`settings.tier.${view.tier}`) })}
            </p>
          ) : null}
          {/* Open-world-3d T5 (PD-5): zoom continuo; la lectura dice la distancia o "Mapa completo", y V tiene su botón. */}
          <div className={`pointer-events-auto flex items-center gap-2 p-1 ${CARD}`}>
            <Button id="world-zoom-out" aria-disabled={view.zoomAtMax} onClick={() => actions.zoomOut()}>{t("world.zoomOut")}</Button>
            <span data-testid="world-zoom-readout" className="px-1 text-sm">
              {view.zoomMeters === null ? t("world.zoomFull") : t("world.zoomMeters", { value: view.zoomMeters.toLocaleString("es-AR") })}
            </span>
            <Button id="world-zoom-in" aria-disabled={view.zoomAtMin} onClick={() => actions.zoomIn()}>{t("world.zoomIn")}</Button>
            <Button id="world-overview" aria-pressed={view.zoomMeters === null} onClick={() => actions.toggleOverview()}>{t("world.overview")}</Button>
          </div>
        </div>
      </div>
      <Minimap />
    </section>
  );
}
