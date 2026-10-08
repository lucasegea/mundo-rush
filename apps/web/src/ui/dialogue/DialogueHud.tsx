// HUD de diálogo (F4.2; GDD §2.6, 03 §2.6, R14). UN SOLO componente para las dos superficies: encima del canvas del
// mapa (`surface="canvas"`) y en el modo solo-diálogo (`surface="dialogOnly"`); solo cambia el marco. Muestra el
// historial con subtítulos, la entrada de texto con "Terminé" (cierra el turno), "Pasar el turno" y sus 4 opciones,
// el chip silencioso de pista a los 10 s (D-035, desactivable) y el glosario al tocar una palabra según el build
// (D-131); una palabra sin entrada se marca para repasar, nunca se traduce (D-068). Teclado primero.
// Lee view-models de state/selectors y despacha state/actions: no conoce la red ni el protocolo.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { t, type MessageKey } from "../../i18n";
import { actions, type PassChoice } from "../../state/actions";
import { selectDialogueHudView, useGameView, type DialogueHudView, type HudLine } from "../../state/selectors";
import { Portrait } from "../dialog-only/Portrait";
import { useFocusOnMount } from "../a11y/hooks";
import { Button } from "../primitives";

export type HudSurface = "dialogOnly" | "canvas";

const PASS_OPTIONS: readonly PassChoice[] = ["hint", "repeat", "simpler", "continue"];

const FRAME: Record<HudSurface, string> = {
  dialogOnly: "mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-6",
  // Sobre el mapa: panel abajo, opaco, que recibe el puntero (el resto del shell lo deja pasar al canvas).
  canvas: "pointer-events-auto fixed inset-x-0 bottom-0 flex max-h-[75dvh] flex-col gap-3 overflow-y-auto border-t-2 border-line bg-surface p-4 shadow-lg",
};

interface WordChoice {
  word: string;
  key: string;
  /** Id del botón que la abrió (el foco vuelve ahí al cerrar). */
  from: string;
}

/** Chip de pista: corre solo en `waiting`, con el ajuste prendido y sin nada escrito; cualquier cambio lo reinicia. */
function useHintChip(active: boolean, delayMs: number, resetKey: string): boolean {
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setShown(resetKey), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs, resetKey]);
  return active && shown === resetKey;
}

function phaseText(view: DialogueHudView): string {
  switch (view.phase) {
    case "connecting": return t("scene.phase.connecting");
    case "starting": return t("scene.phase.starting");
    case "npcSpeaking": return view.npcName ? t("scene.phase.npcSpeaking", { name: view.npcName }) : t("scene.phase.npcSpeakingStory");
    case "yourTurn": return t("scene.phase.yourTurn");
    case "passMenu": return t("scene.phase.passMenu");
    case "offline": return t("scene.offline");
    case "blocked": return t(view.blocked === "notIntroduced" ? "scene.blocked.notIntroduced" : "scene.blocked.noScene");
    case "ended": return t(`scene.end.${view.outcome ?? "aborted"}` as MessageKey);
  }
}

function LineView({ line, onWord }: { line: HudLine; onWord(choice: WordChoice): void }) {
  const speaker = line.who === "player" ? t("scene.you") : line.who === "lumi" ? t("scene.lumi") : line.name;
  if (line.who === "system") return <li className="text-sm italic text-ink-muted">{t("scene.cut")}</li>;
  // Palabras con tabindex itinerante: Tab entra a la línea por la primera palabra; las flechas recorren el resto.
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const words = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-word]")];
    const i = words.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    words[Math.min(words.length - 1, Math.max(0, i + (e.key === "ArrowRight" ? 1 : -1)))]?.focus();
  };
  let firstWord = true;
  return (
    <li className={`rounded-lg border-2 p-3 ${line.who === "player" ? "border-line bg-paper" : "border-accent-soft bg-surface"}`}>
      {speaker ? <span className="mr-2 font-bold">{speaker}:</span> : null}
      {line.tokens ? (
        <span lang={line.lang} onKeyDown={onKeyDown}>
          {line.tokens.map((tok, i) => {
            if (tok.key === null) return <span key={i}>{tok.text}</span>;
            const id = `word-${line.id}-${i}`;
            const tabIndex = firstWord ? 0 : -1;
            firstWord = false;
            const key = tok.key;
            return (
              <button key={i} id={id} type="button" data-word={key} tabIndex={tabIndex}
                className="rounded px-0.5 underline decoration-dotted underline-offset-4 focus-visible:outline-2"
                onClick={() => onWord({ word: tok.text, key, from: id })}>
                {tok.text}
              </button>
            );
          })}
        </span>
      ) : <span lang={line.lang}>{line.text}</span>}
    </li>
  );
}

function WordCard({ choice, view, onClose }: { choice: WordChoice; view: DialogueHudView; onClose(): void }) {
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const entry = view.glossary[choice.key];
  return (
    <aside aria-labelledby="word-title" className="flex flex-col gap-2 rounded-lg border-2 border-accent bg-paper p-3">
      <h2 id="word-title" ref={heading} tabIndex={-1} className="text-lg font-bold" lang="en">{t("scene.word.title", { word: choice.word })}</h2>
      {entry ? (
        <>
          <p>
            <span lang="en" className="font-semibold">{entry.en}</span>: {entry.es}
            {entry.draft ? <span className="ml-2 rounded border border-line px-1 text-sm">{t("scene.word.draft")}</span> : null}
          </p>
          {entry.notes ? <p className="text-sm text-ink-muted">{t("scene.word.notes", { notes: entry.notes })}</p> : null}
        </>
      ) : <p>{t("scene.word.missing")}</p>}
      <div className="flex flex-wrap gap-2">
        <Button id="word-mark" onClick={() => { actions.markForReview(choice.key); onClose(); }}>{t("scene.word.mark")}</Button>
        <Button id="word-close" onClick={onClose}>{t("scene.word.close")}</Button>
      </div>
    </aside>
  );
}

export function DialogueHud({ surface }: { surface: HudSurface }) {
  const view = useGameView(selectDialogueHudView);
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const input = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [word, setWord] = useState<WordChoice | null>(null);
  const chip = useHintChip(view.hintChipEnabled && view.waiting && draft.trim() === "", view.hintChipDelayMs, `${view.lines.length}`);

  // Teclado primero: cuando VUELVE tu turno, el foco va a la caja de texto (salvo que estés leyendo una palabra).
  // Solo en la transición de canWrite: cerrar la tarjeta de una palabra devuelve el foco a la palabra, no a la caja.
  const canWrite = view.canWrite;
  useEffect(() => {
    if (canWrite && !document.getElementById("word-title")) input.current?.focus();
  }, [canWrite]);

  const closeWord = (): void => {
    const from = word?.from;
    setWord(null);
    if (from) document.getElementById(from)?.focus();
  };

  const submit = (): void => {
    actions.submitTurn(draft);
    if (view.canWrite && draft.trim() !== "") setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    if (word) closeWord();
    else actions.leaveScene();
  };

  const title = view.npcName ? t("scene.title", { name: view.npcName }) : t("scene.titleStory");
  const finished = view.phase === "ended" || view.phase === "blocked" || view.phase === "offline";

  return (
    <section aria-labelledby="scene-title" data-surface={surface} data-testid="dialogue-hud" className={FRAME[surface]} onKeyDown={onKeyDown}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {view.npcId && surface === "dialogOnly" ? <Portrait id={view.npcId} name={view.npcName ?? view.npcId} size={64} /> : null}
          <h1 id="scene-title" ref={heading} tabIndex={-1} className="text-2xl font-bold">{title}</h1>
        </div>
        <Button id="scene-leave" onClick={() => actions.leaveScene()}>{t("scene.leave")}</Button>
      </header>

      <p className="font-semibold" data-phase={view.phase}>{phaseText(view)}</p>
      {view.notice && view.notice !== "containment" ? <p className="text-sm text-ink-muted">{t(`scene.notice.${view.notice}` as MessageKey)}</p> : null}

      {view.lines.length > 0 ? (
        <>
          <p className="sr-only">{t("scene.words")}</p>
          <ol role="log" aria-label={t("scene.history")} className="flex flex-col gap-2">
            {view.lines.map((l) => <LineView key={l.id} line={l} onWord={setWord} />)}
          </ol>
        </>
      ) : null}

      {word ? <WordCard choice={word} view={view} onClose={closeWord} /> : null}

      {view.containment ? (
        <section aria-labelledby="containment-title" className="flex flex-col gap-2 rounded-lg border-2 border-danger bg-paper p-3">
          <h2 id="containment-title" className="text-lg font-bold">{t("scene.containment.title")}</h2>
          <p>{view.containment.line}</p>
          {view.containment.resource ? (
            <p><span className="font-semibold">{view.containment.resource.label}:</span> {view.containment.resource.detail}</p>
          ) : null}
          {view.containment.provisional ? <p className="text-sm text-ink-muted">{t("scene.containment.provisional")}</p> : null}
        </section>
      ) : null}

      {finished ? (
        <div><Button id="scene-back" variant="primary" onClick={() => actions.leaveScene()}>{t("scene.back")}</Button></div>
      ) : (
        <>
          {view.phase === "passMenu" ? (
            <fieldset className="flex flex-wrap gap-2 rounded-lg border-2 border-line p-3">
              <legend className="px-1 font-semibold">{t("scene.pass.title")}</legend>
              {PASS_OPTIONS.map((o, i) => (
                <Button key={o} id={`pass-${o}`} autoFocus={i === 0} onClick={() => actions.choosePass(o)}>{t(`scene.pass.${o}`)}</Button>
              ))}
            </fieldset>
          ) : null}

          {chip ? (
            <div><Button id="scene-hint-chip" variant="ghost" className="border-line" onClick={() => actions.passTurn()}>{t("scene.hintChip")}</Button></div>
          ) : null}

          <div className="flex flex-col gap-2">
            <label htmlFor="scene-input" className="font-semibold">{t("scene.input.label")}</label>
            <textarea
              id="scene-input" ref={input} lang="en" rows={2} maxLength={500}
              className="w-full rounded-lg border-2 border-line bg-paper p-2 text-base"
              aria-describedby="scene-input-hint" aria-disabled={!view.canWrite}
              value={draft}
              onChange={(e) => setDraft(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <p id="scene-input-hint" className="text-sm text-ink-muted">{t("scene.input.hint")}</p>
            <div className="flex flex-wrap gap-2">
              <Button id="scene-done" variant="primary" aria-disabled={!view.canWrite} onClick={submit}>{t("scene.done")}</Button>
              <Button id="scene-pass" aria-disabled={!view.canPass} onClick={() => actions.passTurn()}>{t("scene.pass")}</Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
