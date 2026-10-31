// Dialog-only mode (03 §2.7.1-§2.7.2, GDD §2.19): alternative render without WebGL. List of the region's places
// (F1.2 content), who is at each one with their SVG portrait (D-030) and "enter the scene" (opens the dialogue HUD
// from F4.2). "Follow the story" opens the scene that has no NPC (Lumi's, like M0.2). All by keyboard:
// places are buttons with aria-pressed.
import { t } from "../../i18n";
import { actions } from "../../state/actions";
import { selectDialogOnlyView, selectSettingsView, useGameView } from "../../state/selectors";
import { Button } from "../primitives";
import { useFocusOnMount } from "../a11y/hooks";
import { Portrait } from "./Portrait";

export function DialogOnlyView() {
  const view = useGameView(selectDialogOnlyView);
  const { tierLocked } = useGameView(selectSettingsView);
  const heading = useFocusOnMount<HTMLHeadingElement>();

  return (
    <section aria-labelledby="dialog-only-title" className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <h1 id="dialog-only-title" ref={heading} tabIndex={-1} className="text-2xl font-bold">{t("dialogOnly.title")}</h1>
      {tierLocked ? <p className="rounded-lg border-2 border-line bg-surface p-3">{t("settings.tier.locked")}</p> : null}
      <p>{t("dialogOnly.intro")}</p>
      <div>
        <Button id="dialog-only-story" onClick={() => actions.enterScene(null, "dialog-only-story")}>{t("dialogOnly.continueStory")}</Button>
      </div>

      {view.status === "error" ? <p role="alert" className="font-semibold text-danger">{t("dialogOnly.error")}</p> : null}
      {view.status === "loading" || view.status === "idle" ? <p>{t("dialogOnly.loading")}</p> : null}

      {view.status === "ready" ? (
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <nav aria-labelledby="dialog-only-places">
            <h2 id="dialog-only-places" className="mb-1 text-xl font-semibold">{t("dialogOnly.places")}</h2>
            {view.regionName ? <p className="mb-3 text-sm text-ink-muted">{view.regionName}</p> : null}
            <ul className="flex flex-col gap-2">
              {view.places.map((p) => (
                <li key={p.id}>
                  <Button
                    id={`place-${p.id}`}
                    className={`w-full justify-between ${p.selected ? "bg-accent-soft" : ""}`}
                    aria-pressed={p.selected}
                    onClick={() => actions.selectPlace(p.id)}
                  >
                    <span>{p.name}</span>
                    {p.npcNames.length > 0 ? (
                      <span className="text-sm font-normal text-ink-muted">{t("dialogOnly.people", { count: p.npcNames.length })}</span>
                    ) : null}
                  </Button>
                </li>
              ))}
            </ul>
          </nav>

          <section aria-labelledby="dialog-only-detail" className="flex flex-col gap-3">
            {view.selected ? (
              <>
                <h2 id="dialog-only-detail" className="text-xl font-semibold">{view.selected.name}</h2>
                {view.selected.en ? <p lang="en" className="italic">{t("dialogOnly.sign", { en: view.selected.en })}</p> : null}
                {view.selected.description ? <p className="text-ink-muted">{view.selected.description}</p> : null}
                <h3 className="text-lg font-semibold">{t("dialogOnly.here")}</h3>
                {view.selected.npcs.length === 0 ? <p>{t("dialogOnly.emptyPlace")}</p> : (
                  <ul className="flex flex-col gap-3">
                    {view.selected.npcs.map((n) => (
                      <li key={n.id} className="flex flex-wrap items-center gap-4 rounded-lg border-2 border-line bg-surface p-3">
                        <Portrait id={n.id} name={n.name} />
                        <div className="flex flex-col gap-2">
                          <span className="text-lg font-semibold">{n.name}</span>
                          <Button id={`talk-${n.id}`} variant="primary" onClick={() => actions.enterScene(n.id, `talk-${n.id}`)}>
                            {t("dialogOnly.enterScene", { name: n.name })}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p id="dialog-only-detail">{t("dialogOnly.choosePlace")}</p>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}
