// Shell DOM (03 §2.6, R14): muestra el panel de arriba de la pila o, si no hay, la vista de la fase con la
// barra superior. Una cosa por vez: lo de atrás no recibe foco. La región aria-live está siempre montada.
import type { AppPhase } from "@lg/core";
import { t } from "../../i18n";
import { actions } from "../../state/actions";
import { selectShellView, useGameView } from "../../state/selectors";
import { LiveRegion } from "../a11y/LiveRegion";
import { useDocumentSettings, useFocusRequests } from "../a11y/hooks";
import { DialogOnlyView } from "../dialog-only/DialogOnlyView";
import { DialogueHud } from "../dialogue/DialogueHud";
import { WorldHud } from "../hud/WorldHud";
import { MainMenu } from "../menus/MainMenu";
import { Button } from "../primitives";
import { SettingsPanel } from "../settings/SettingsPanel";

function TopBar() {
  return (
    <header aria-label={t("topbar.label")} className="pointer-events-auto flex flex-wrap items-center justify-between gap-2 border-b-2 border-line bg-surface px-4 py-2">
      <span className="text-lg font-bold">{t("app.title")}</span>
      <div className="flex gap-2">
        <Button id="topbar-menu" onClick={() => actions.openMainMenu("topbar-menu")}>{t("topbar.menu")}</Button>
        <Button id="topbar-settings" onClick={() => actions.openSettings("topbar-settings")}>{t("topbar.settings")}</Button>
      </div>
    </header>
  );
}

function PhaseView({ phase }: { phase: AppPhase }) {
  if (phase === "dialogOnly") return <DialogOnlyView />;
  if (phase === "world") return <WorldHud />;
  return <p className="p-6">{t("app.loading")}</p>;
}

export function Shell() {
  const view = useGameView(selectShellView);
  useDocumentSettings();
  useFocusRequests();

  const panel = view.panel;
  let content;
  if (panel?.kind === "mainMenu") content = <MainMenu />;
  else if (panel?.kind === "settings") content = <SettingsPanel />;
  // F4.2: el MISMO HUD de diálogo sobre el canvas del mapa o en solo-diálogo (A3); solo cambia el marco.
  else if (panel?.kind === "scene") content = <DialogueHud surface={view.phase === "world" ? "canvas" : "dialogOnly"} />;
  else content = <PhaseView phase={view.phase} />;

  // En el mapa sin paneles (o con el HUD de diálogo), el shell queda transparente encima del canvas y deja pasar el
  // puntero (solo sus controles lo reciben). Los demás paneles tapan el mapa (el canvas pasa a frameloop "demand").
  const overMap = view.phase === "world" && (panel === null || panel.kind === "scene");
  return (
    <div className={overMap ? "pointer-events-none relative z-10 min-h-dvh text-ink" : "relative z-10 min-h-dvh bg-paper text-ink"}>
      {panel === null && view.phase !== "boot" ? <TopBar /> : null}
      <main id="main">{content}</main>
      <LiveRegion />
    </div>
  );
}
