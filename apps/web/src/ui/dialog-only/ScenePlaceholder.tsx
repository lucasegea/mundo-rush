// "Entrar a la escena" en solo-diálogo: placeholder hasta F4 (máquina de escena + HUD de diálogo).
import type { KeyboardEvent } from "react";
import { t } from "../../i18n";
import { actions } from "../../state/actions";
import { Button } from "../primitives";
import { useFocusOnMount } from "../a11y/hooks";
import { Portrait } from "./Portrait";

export function ScenePlaceholder({ npcId, name }: { npcId: string; name: string }) {
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      actions.closePanel();
    }
  };
  return (
    <section aria-labelledby="scene-title" className="mx-auto flex max-w-xl flex-col items-start gap-4 p-6" onKeyDown={onKeyDown}>
      <h1 id="scene-title" ref={heading} tabIndex={-1} className="text-2xl font-bold">{t("scene.title", { name })}</h1>
      <Portrait id={npcId} name={name} size={128} />
      <p>{t("scene.placeholder", { name })}</p>
      <Button id="scene-back" variant="primary" onClick={() => actions.closePanel()}>{t("scene.back")}</Button>
    </section>
  );
}
