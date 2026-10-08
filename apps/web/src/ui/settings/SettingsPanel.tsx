// Ajustes (GDD §2.19): tamaño de texto, alto contraste, reducir movimiento, subtítulos, velocidad de los
// vecinos, modo de feedback (placeholder hasta F6) y calidad gráfica (R12). Cada cambio va al store por una
// acción y se anuncia por aria-live. Escape o "Volver" cierran y devuelven el foco.
import type { KeyboardEvent } from "react";
import { t } from "../../i18n";
import { actions } from "../../state/actions";
import { selectSettingsView, useGameView } from "../../state/selectors";
import { Button, RadioGroup, Toggle } from "../primitives";
import { useFocusOnMount } from "../a11y/hooks";

export function SettingsPanel() {
  const view = useGameView(selectSettingsView);
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const scaleIndex = view.textScales.indexOf(view.textScale);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      actions.closePanel();
    }
  };

  return (
    <section aria-labelledby="settings-title" className="mx-auto flex max-w-xl flex-col gap-6 p-6" onKeyDown={onKeyDown}>
      <h1 id="settings-title" ref={heading} tabIndex={-1} className="text-2xl font-bold">{t("settings.title")}</h1>

      <section aria-labelledby="settings-reading" className="flex flex-col gap-4">
        <h2 id="settings-reading" className="text-xl font-semibold">{t("settings.section.reading")}</h2>
        <div className="flex flex-col gap-2">
          <label htmlFor="settings-text-scale" className="font-semibold">{t("settings.textScale")}</label>
          <div className="flex min-h-11 items-center gap-4">
            <input
              id="settings-text-scale"
              type="range"
              className="w-full max-w-xs accent-accent"
              min={0}
              max={view.textScales.length - 1}
              step={1}
              value={scaleIndex}
              aria-valuetext={t("settings.textScale.value", { value: view.textScale })}
              onChange={(e) => {
                const next = view.textScales[Number(e.currentTarget.value)];
                if (next !== undefined) actions.setTextScale(next);
              }}
            />
            <span aria-hidden="true" className="min-w-16 font-semibold">
              {t("settings.textScale.value", { value: view.textScale })}
            </span>
          </div>
        </div>
        <Toggle id="settings-high-contrast" label={t("settings.highContrast")} checked={view.highContrast} onChange={actions.setHighContrast} />
        <Toggle id="settings-reduce-motion" label={t("settings.reduceMotion")} checked={view.reduceMotion} onChange={actions.setReduceMotion} />
        <Toggle id="settings-subtitles" label={t("settings.subtitles")} checked={view.subtitles} onChange={actions.setSubtitles} />
      </section>

      <section aria-labelledby="settings-conversation" className="flex flex-col gap-4">
        <h2 id="settings-conversation" className="text-xl font-semibold">{t("settings.section.conversation")}</h2>
        <Toggle id="settings-hint-chip" label={t("settings.hintChip")} description={t("settings.hintChip.desc")} checked={view.hintChip} onChange={actions.setHintChip} />
        <RadioGroup
          name="settings-npc-speed"
          legend={t("settings.npcSpeed")}
          options={view.npcSpeeds.map((v) => ({ value: v, label: t(`settings.npcSpeed.${v}`) }))}
          value={view.npcSpeed}
          onChange={actions.setNpcSpeed}
        />
        <RadioGroup
          name="settings-feedback-mode"
          legend={t("settings.feedbackMode")}
          description={t("settings.feedbackMode.hint")}
          options={view.feedbackModes.map((v) => ({ value: v, label: t(`settings.feedbackMode.${v}`) }))}
          value={view.feedbackMode}
          onChange={actions.setFeedbackMode}
        />
      </section>

      <section aria-labelledby="settings-graphics" className="flex flex-col gap-4">
        <h2 id="settings-graphics" className="text-xl font-semibold">{t("settings.section.graphics")}</h2>
        <RadioGroup
          name="settings-tier"
          legend={t("settings.tier")}
          description={view.tierLocked
            ? t("settings.tier.locked")
            : t("settings.tier.suggested", { tier: t(`settings.tier.${view.suggestedTier}`) })}
          options={view.tierChoices.map((v) => ({ value: v, label: t(`settings.tier.${v}`) }))}
          value={view.tierChoice}
          onChange={actions.setTierChoice}
          disabled={view.tierLocked}
        />
      </section>

      <div>
        <Button id="settings-back" variant="primary" onClick={() => actions.closePanel()}>{t("settings.back")}</Button>
      </div>
    </section>
  );
}
