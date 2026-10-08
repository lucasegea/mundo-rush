// Modo solo-diálogo (03 §2.7.1-§2.7.2, GDD §2.19): render alternativo sin WebGL. Lista de lugares de la región
// (contenido de F1.2), quién está en cada uno con su retrato SVG (D-030) y "entrar a la escena" (abre el HUD de
// diálogo de F4.2). "Seguir la historia" abre la escena que no tiene NPC (las de Lumi, como M0.2). Todo por teclado:
// los lugares son botones con aria-pressed.
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
