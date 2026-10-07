// Fase `world` antes de F2: el canvas todavía no existe. Se explica y se ofrece el modo solo-diálogo.
import { t } from "../../i18n";
import { actions } from "../../state/actions";
import { Button } from "../primitives";
import { useFocusOnMount } from "../a11y/hooks";

export function WorldPlaceholder() {
  const heading = useFocusOnMount<HTMLHeadingElement>();
  return (
    <section aria-labelledby="world-title" className="mx-auto flex max-w-xl flex-col items-start gap-4 p-6">
      <h1 id="world-title" ref={heading} tabIndex={-1} className="text-2xl font-bold">{t("world.title")}</h1>
      <p>{t("world.placeholder")}</p>
      <Button id="world-to-dialog-only" variant="primary" onClick={() => actions.enterDialogOnly()}>{t("world.toDialogOnly")}</Button>
    </section>
  );
}
