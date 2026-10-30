// Menú principal: lista de botones nativos. Tab y Shift+Tab recorren; además flechas, Inicio y Fin mueven el
// foco dentro de la lista; Escape cierra el menú cuando hay una vista detrás. Open-world-3d T10 (d): el clic en
// "Explorar el mapa" despacha enterWorld, que marca `lg:world-enter` (inicio de la medida de carga, AC63).
import type { KeyboardEvent } from "react";
import { t } from "../../i18n";
import { actions } from "../../state/actions";
import { selectMainMenuView, useGameView } from "../../state/selectors";
import { Button } from "../primitives";
import { useFocusOnMount } from "../a11y/hooks";

const MOVES: Record<string, (i: number, n: number) => number> = {
  ArrowDown: (i, n) => (i + 1) % n,
  ArrowUp: (i, n) => (i - 1 + n) % n,
  Home: () => 0,
  End: (_i, n) => n - 1,
};

function moveFocus(e: KeyboardEvent<HTMLUListElement>): void {
  const move = MOVES[e.key];
  if (!move) return;
  const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
  if (items.length === 0) return;
  e.preventDefault();
  const current = items.indexOf(document.activeElement as HTMLButtonElement);
  items[move(Math.max(current, 0), items.length)]?.focus();
}

export function MainMenu() {
  const view = useGameView(selectMainMenuView);
  const firstItem = useFocusOnMount<HTMLButtonElement>();
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape" && view.canClose) {
      e.preventDefault();
      actions.closePanel();
    }
  };
  return (
    <section aria-labelledby="main-menu-title" className="mx-auto flex max-w-md flex-col gap-4 p-6" onKeyDown={onKeyDown}>
      <h1 id="main-menu-title" className="text-2xl font-bold">{t("app.title")}</h1>
      <nav aria-label={t("menu.title")}>
        <p id="main-menu-hint" className="mb-3 text-sm text-ink-muted">{t("menu.hint")}</p>
        <ul className="flex flex-col gap-3" onKeyDown={moveFocus}>
          <li>
            <Button
              id="menu-world"
              ref={firstItem}
              variant="primary"
              className="w-full"
              aria-disabled={!view.worldAvailable}
              aria-describedby={view.worldAvailable ? undefined : "menu-world-unavailable"}
              onClick={() => actions.enterWorld()}
            >
              {t("menu.world")}
            </Button>
            {view.worldAvailable ? null : <p id="menu-world-unavailable" className="mt-1 text-sm text-ink-muted">{t("menu.worldUnavailable")}</p>}
          </li>
          <li>
            <Button id="menu-dialog-only" className="w-full" onClick={() => actions.enterDialogOnly()}>{t("menu.dialogOnly")}</Button>
          </li>
          <li>
            <Button id="menu-settings" className="w-full" onClick={() => actions.openSettings("menu-settings")}>{t("menu.settings")}</Button>
          </li>
          {view.canClose ? (
            <li>
              <Button id="menu-close" variant="ghost" className="w-full" onClick={() => actions.closePanel()}>{t("menu.close")}</Button>
            </li>
          ) : null}
        </ul>
      </nav>
    </section>
  );
}
