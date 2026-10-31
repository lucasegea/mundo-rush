// Map HUD (F2, R14): a view of the store, never of the canvas (R3). The "E Talk to <name>" prompt comes from
// `selectWorldHudView`, which reads the nearby interactables computed by the core. Everything done with
// keys also has a button (accessibility: full keyboard and pointer, not depending on a single device).
// Plan estetica-c M4 (proposal C §8, "paper and ink"): top left the objective on one line with an amber dot;
// bottom left the controls help; bottom center the prompt; bottom right the zoom and, only in
// development, the quality chip. On narrow screens the help and the chip are hidden. In conversation this HUD is not
// shown (the shell puts the dialogue one), so the help disappears on its own. Open-world-3d T9: bottom right, below
// the zoom, the minimap (ui/hud/Minimap.tsx), which for that reason is not seen in conversation either. T10-integrate: on
// narrow screens the prompt and the zoom are stacked over the minimap (ui/hud/layout.ts), so the prompt never covers it.
import { t } from "../../i18n";
import { actions } from "../../state/actions";
import { selectWorldHudView, useGameView } from "../../state/selectors";
import { useFocusOnMount } from "../a11y/hooks";
import { Button } from "../primitives";
import { MINIMAP_CLEARANCE_NARROW, MINIMAP_CLEARANCE_SIDE } from "./layout";
import { Minimap } from "./Minimap";

const CARD = "rounded-card border-2 border-card-line bg-paper shadow-card";

export function WorldHud() {
  const view = useGameView(selectWorldHudView);
  const heading = useFocusOnMount<HTMLHeadingElement>();
  return (
    // The HUD lets the pointer through to the map; only its controls receive it.
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
        {/* The objective on one line with an amber dot. M4 SEAM: today the only objective is to follow the story; the text of the
            current mission's objective arrives with the mission state (M5) and replaces this label. */}
        <Button id="world-story" data-testid="world-objective" className={`pointer-events-auto max-w-full whitespace-nowrap ${CARD}`} onClick={() => actions.enterScene(null, "world-story")}>
          <span aria-hidden="true" className="inline-block h-3 w-3 shrink-0 rounded-full border-2 border-amber-strong bg-amber" />
          <span className="truncate">{t("world.continueStory")}</span>
        </Button>
      </div>

      {/* T10-integrate: on narrow screens a single column (the prompt above the zoom) that leaves the minimap's height
          free, so the prompt never covers it (at 375 px the centered prompt fell on top of the circle); from md, three. */}
      <div className={`grid grid-cols-1 items-end gap-2 md:grid-cols-[1fr_auto_1fr] ${MINIMAP_CLEARANCE_NARROW}`}>
        {/* Bottom left: the controls help (hidden on narrow screens). */}
        <p data-testid="world-controls" className={`hidden max-w-[22rem] px-3 py-2 text-sm md:block ${CARD}`}>{t("world.controls")}</p>
        {/* Bottom center: who the E will answer to. Comes from selectInteractionPrompt, the same selector that
            highlights the NPC in the world (plan estetica-c M1 item 15), so the prompt's name and the highlight do not differ. */}
        <div role="status" aria-live="polite" className="flex justify-center md:col-start-2">
          {view.prompt ? (
            <p id="world-prompt" className={`pointer-events-auto flex max-w-full items-center gap-2 px-3 py-2 ${CARD}`}>
              <kbd className="rounded-md border-2 border-amber-strong bg-amber px-2 font-semibold text-on-amber">{t("world.prompt.key")}</kbd>{" "}
              <Button id="world-talk" variant="primary" onClick={() => actions.interact(view.prompt?.id ?? null)}>
                {t("world.talk", { name: view.prompt.name })}
              </Button>
            </p>
          ) : null}
        </div>
        {/* Open-world-3d T9: the minimap is fixed at bottom right; from md this column leaves its height free below
            (10rem plus 1rem of air) so the zoom sits above and does not cover it (on narrow the whole block leaves it). */}
        <div className={`flex flex-col items-end gap-2 justify-self-end md:col-start-3 ${MINIMAP_CLEARANCE_SIDE}`}>
          {/* Bottom right, development only: the effective quality. M4 SEAM: FPS and the renderer.info counters
              arrive in M6 (director mode snapshot); until then they are read in the browser. */}
          {import.meta.env.DEV ? (
            <p data-testid="world-quality" className={`hidden px-2 py-1 text-xs text-ink-muted md:inline-flex ${CARD}`}>
              {t("world.quality", { tier: t(`settings.tier.${view.tier}`) })}
            </p>
          ) : null}
          {/* Open-world-3d T5 (PD-5): continuous zoom; the readout gives the distance or "Full map", and V has its button. */}
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
