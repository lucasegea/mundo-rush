// HUD de diálogo (F4.2; GDD §2.6, 03 §2.6, R14). UN SOLO componente para las dos superficies: encima del canvas del
// mapa (`surface="canvas"`) y en el modo solo-diálogo (`surface="dialogOnly"`); solo cambia el marco. Muestra el
// historial con subtítulos, la entrada de texto con "Terminé" (cierra el turno), "Pasar el turno" y sus 4 opciones,
// el chip silencioso de pista a los 10 s (D-035, desactivable) y el glosario al tocar una palabra según el build
// (D-131); una palabra sin entrada se marca para repasar, nunca se traduce (D-068). Teclado primero.
// F5.2: en una escena de voz, en lugar de la caja de texto: "Hablar" (mantener apretado = pulsar-para-hablar; tocar
// una vez abre el turno y "Terminé" lo cierra), indicador "te escucho / pensando", lo que se va oyendo y el medidor
// del micrófono. Sin micrófono o sin permiso la escena va por texto y se dice por qué.
// A2 (ADR-027): en una conversación libre por medidores, el panel de medidores, "Lo que sabés de…" y la escalera de
// ayuda (ConversationPanel), en voz y en texto.
// Plan estetica-c M4 (propuesta C §8, "papel y tinta"): sobre el mapa, tarjeta de papel abajo al centro (hasta 47,5rem)
// con el chip ámbar del nombre, la línea del NPC más grande, la palabra nueva subrayada con puntos, el indicador de
// turno (punto gris "habla", punto verde que late "tu turno", quieto con "reducir movimiento") y la barra de andamiaje
// con Terminé, el botón oscuro, a la derecha. Misma estructura, mismos ids: cambian tokens y disposición. Todo en rem.
// Lee view-models de state/selectors y despacha state/actions: no conoce la red ni el protocolo.
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { t, type MessageKey } from "../../i18n";
import { actions, type PassChoice } from "../../state/actions";
import { selectDialogueHudView, useGameView, type DialogueHudView, type HudLine, type VoiceHudView } from "../../state/selectors";
import { Portrait } from "../dialog-only/Portrait";
import { useFocusOnMount } from "../a11y/hooks";
import { Button } from "../primitives";
import { ConversationPanel } from "./ConversationPanel";

export type HudSurface = "dialogOnly" | "canvas";

/**
 * Orden de la barra de andamiaje de la propuesta C §8: Repetir · Más despacio · Pista · Escribir · Terminé. Las
 * opciones de "Pasar el turno" van en ese orden (`simpler` es la más cercana a "Más despacio"; `continue` no está en
 * la propuesta y va al final del grupo) y Terminé cierra la barra, a la derecha.
 * M4 SEAM: "Escribir" (pasar de voz a texto dentro de la misma escena) pide cambiar la lógica de turnos y de
 * modalidad, fuera de M4; cuando exista entra entre `hint` y Terminé.
 */
export const PASS_OPTIONS: readonly PassChoice[] = ["repeat", "simpler", "hint", "continue"];

const FRAME: Record<HudSurface, string> = {
  dialogOnly: "mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-6",
  // Sobre el mapa: tarjeta de papel abajo al centro, opaca, que recibe el puntero (el resto del shell lo deja pasar al
  // canvas). Alto máximo ~45 % para no tapar el plano de a dos (plan estetica-c M1 ítem 16); lo que no entra scrollea
  // adentro. Ancho hasta 47,5rem (propuesta C §8).
  canvas: "pointer-events-auto fixed inset-x-3 bottom-3 mx-auto flex max-h-[45dvh] max-w-[47.5rem] flex-col gap-3 overflow-y-auto rounded-card border-2 border-card-line bg-paper p-4 shadow-card",
};

type DotKind = "speaking" | "turn" | "listening";
const DOT_CLASS: Readonly<Record<DotKind, string>> = {
  speaking: "bg-line",
  turn: "bg-turn",
  listening: "bg-danger",
};

/** Punto del indicador de turno. Solo late en tu turno y nunca con "reducir movimiento" (`data-pulse`). */
function TurnDot({ kind, reduceMotion }: { kind: DotKind; reduceMotion: boolean }) {
  const pulse = kind === "turn" && !reduceMotion;
  return (
    <span
      aria-hidden="true" data-testid="turn-dot" data-dot={kind} data-pulse={String(pulse)}
      className={`inline-block h-3 w-3 shrink-0 rounded-full ${DOT_CLASS[kind]} ${pulse ? "lg-pulse" : ""}`}
    />
  );
}

/** Terminé: el botón oscuro a la derecha de la barra. Espacio y Enter lo activan (botón nativo); la tecla se muestra. */
function DoneButton({ disabled, onClick }: { disabled: boolean; onClick(): void }) {
  return (
    <Button id="scene-done" variant="primary" className="ml-auto" aria-disabled={disabled} aria-keyshortcuts="Space Enter" onClick={onClick}>
      {t("scene.done")}
      <kbd aria-hidden="true" className="rounded-md border border-paper px-1.5 text-xs font-semibold">{t("scene.done.key")}</kbd>
    </Button>
  );
}

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

/**
 * La frase de la causa de un `model_unavailable` (open-world-3d T1). Solo `http` con estado lleva número; sin estado
 * (red caída) va la frase sin código, nunca "null".
 */
export function noticeCauseText(cause: NonNullable<DialogueHudView["noticeCause"]>): string {
  if (cause.kind === "http") return cause.status === null ? t("scene.notice.cause.http_sin_codigo") : t("scene.notice.cause.http", { status: cause.status });
  return t(`scene.notice.cause.${cause.kind}`);
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

/** Mantener "Hablar" al menos esto (ms) cuenta como pulsar-para-hablar: al soltar se cierra el turno. Menos, es un toque. */
export const HOLD_TO_TALK_MS = 400;

function voiceStatus(v: VoiceHudView, npcName: string | null): string {
  switch (v.phase) {
    case "asking": return t("scene.voice.asking");
    case "yourTurn": return t("scene.voice.yourTurn");
    case "listening": return v.ending ? t("scene.voice.ending") : t("scene.voice.listening");
    case "thinking": return npcName ? t("scene.voice.thinking", { name: npcName }) : t("scene.voice.thinkingStory");
    case "npcSpeaking": return npcName ? t("scene.voice.npcSpeaking", { name: npcName }) : t("scene.voice.npcSpeakingStory");
  }
}

/** Controles de voz: Hablar (mantener o tocar), Terminé, Pasar el turno, indicador, lo oído y el medidor. */
function voiceDot(v: VoiceHudView): DotKind {
  if (v.phase === "listening") return "listening";
  return v.phase === "yourTurn" ? "turn" : "speaking";
}

function VoiceControls({ v, npcName, canPass, reduceMotion }: { v: VoiceHudView; npcName: string | null; canPass: boolean; reduceMotion: boolean }) {
  const talk = useRef<HTMLButtonElement>(null);
  const pressedAt = useRef<number | null>(null);

  // Teclado primero: cuando vuelve tu turno, el foco va a "Hablar".
  const canTalk = v.canTalk;
  useEffect(() => {
    if (canTalk && !document.getElementById("word-title")) talk.current?.focus();
  }, [canTalk]);

  const release = (): void => {
    const at = pressedAt.current;
    pressedAt.current = null;
    if (at !== null && Date.now() - at >= HOLD_TO_TALK_MS) actions.voiceTalkEnd();
  };
  // Teclado (click sin puntero, detail = 0): Espacio/Enter abre el turno y, otra vez, lo cierra.
  const onClick = (e: MouseEvent<HTMLButtonElement>): void => {
    if (e.detail !== 0) return;
    if (v.canTalk) actions.voiceTalkStart();
    else if (v.canFinish) actions.voiceTalkEnd();
  };

  return (
    <div className="flex flex-col gap-2" data-testid="voice-controls">
      <p role="status" className="flex items-center gap-2 font-semibold" data-voice-phase={v.phase}>
        <TurnDot kind={voiceDot(v)} reduceMotion={reduceMotion} />
        {voiceStatus(v, npcName)}
      </p>
      {v.heard ? <p className="text-ink-muted" lang="en">{t("scene.voice.heard", { text: v.heard })}</p> : null}
      {v.hint ? <p className="text-sm">{t(v.hint === "silent" ? "scene.voice.hint.silent" : "scene.voice.hint.unheard")}</p> : null}
      <label className="flex items-center gap-2 text-sm text-ink-muted">
        {t("scene.voice.level")}
        <meter min={0} max={1} low={0.15} high={0.9} optimum={0.5} value={v.level} className="h-3 w-40" data-testid="mic-level" />
      </label>
      <p id="scene-talk-hint" className="text-sm text-ink-muted">{t("scene.voice.talkHint")}</p>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("scene.scaffold")} data-testid="scaffold-bar">
        <Button
          id="scene-talk" ref={talk} variant="primary" aria-pressed={v.phase === "listening"} aria-disabled={!v.canTalk && !v.canFinish}
          aria-describedby="scene-talk-hint"
          onPointerDown={(e) => {
            if (!v.canTalk) return;
            e.preventDefault();
            pressedAt.current = Date.now();
            actions.voiceTalkStart();
          }}
          onPointerUp={release}
          onPointerLeave={release}
          onPointerCancel={release}
          onClick={onClick}
        >
          {t("scene.voice.talk")}
        </Button>
        <Button id="scene-pass" aria-disabled={!canPass || v.phase === "listening"} onClick={() => actions.passTurn()}>{t("scene.pass")}</Button>
        <DoneButton disabled={!v.canFinish} onClick={() => actions.voiceTalkEnd()} />
      </div>
    </div>
  );
}

function LineView({ line, onWord }: { line: HudLine; onWord(choice: WordChoice): void }) {
  const speaker = line.who === "player" ? t("scene.you") : line.who === "lumi" ? t("scene.lumi") : line.name;
  if (line.who === "system") return <li className="text-sm italic text-ink-muted">{t("scene.cut")}</li>;
  // La línea del NPC va más grande (propuesta C §8: 22 sobre 16, o sea 1,375rem; escala con el tamaño de texto).
  const big = line.who === "npc";
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
    <li data-line={line.who} className={`rounded-card border-2 p-3 ${line.who === "player" ? "border-card-line bg-surface" : "border-transparent bg-paper"} ${big ? "text-[1.375rem] leading-snug" : ""}`}>
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
    <aside aria-labelledby="word-title" className="flex flex-col gap-2 rounded-card border-2 border-amber-strong bg-surface p-3 shadow-card">
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
          {/* El chip ámbar del nombre (propuesta C §8): texto del chip sobre ámbar ≥ 7:1, con el borde oscuro. */}
          <h1 id="scene-title" ref={heading} tabIndex={-1} data-testid="name-chip" className="rounded-full border-2 border-amber-strong bg-amber px-3 py-0.5 text-lg font-bold text-on-amber">{title}</h1>
        </div>
        <Button id="scene-leave" onClick={() => actions.leaveScene()}>{t("scene.leave")}</Button>
      </header>

      {view.voice && (view.phase === "yourTurn" || view.phase === "npcSpeaking") ? null : (
        <p className="flex items-center gap-2 font-semibold" data-phase={view.phase}>
          {view.phase === "yourTurn" || view.phase === "npcSpeaking" ? (
            <TurnDot kind={view.phase === "yourTurn" ? "turn" : "speaking"} reduceMotion={view.reduceMotion} />
          ) : null}
          {phaseText(view)}
        </p>
      )}
      {view.notice && view.notice !== "containment" ? <p className="text-sm text-ink-muted">{t(`scene.notice.${view.notice}` as MessageKey)}</p> : null}
      {view.notice === "model_unavailable" && view.noticeCause ? <p className="text-sm text-ink-muted" data-testid="notice-cause">{noticeCauseText(view.noticeCause)}</p> : null}
      {view.micProblem ? <p role="alert" className="rounded-card border-2 border-line bg-surface p-2" data-testid="mic-problem">{t(`scene.mic.${view.micProblem}`)}</p> : null}
      {view.micLost ? <p role="alert" className="rounded-card border-2 border-line bg-surface p-2" data-testid="mic-problem">{t("scene.mic.lost")}</p> : null}

      {view.conversation && !view.containment ? (
        <ConversationPanel
          conv={view.conversation} waiting={view.waiting} idleMs={view.conversationHelpIdleMs} resetKey={`${view.lines.length}`}
          floating={surface === "canvas"}
          onPhrase={view.voice ? null : (phrase) => {
            setDraft(phrase);
            input.current?.focus();
          }}
        />
      ) : null}

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
        <section aria-labelledby="containment-title" className="flex flex-col gap-2 rounded-card border-2 border-danger bg-surface p-3">
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
            <fieldset className="flex flex-wrap gap-2 rounded-card border-2 border-card-line p-3" data-testid="pass-menu">
              <legend className="px-1 font-semibold">{t("scene.pass.title")}</legend>
              {PASS_OPTIONS.map((o, i) => (
                <Button key={o} id={`pass-${o}`} autoFocus={i === 0} onClick={() => actions.choosePass(o)}>{t(`scene.pass.${o}`)}</Button>
              ))}
            </fieldset>
          ) : null}

          {chip ? (
            <div><Button id="scene-hint-chip" variant="ghost" className="border-line" onClick={() => actions.passTurn()}>{t("scene.hintChip")}</Button></div>
          ) : null}

          {view.voice ? <VoiceControls v={view.voice} npcName={view.npcName} canPass={view.canPass} reduceMotion={view.reduceMotion} /> : view.micLost ? null : (
          <div className="flex flex-col gap-2">
            <label htmlFor="scene-input" className="font-semibold">{t("scene.input.label")}</label>
            <textarea
              id="scene-input" ref={input} lang="en" rows={2} maxLength={500}
              className="w-full rounded-card border-2 border-line bg-surface p-2 text-base"
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
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("scene.scaffold")} data-testid="scaffold-bar">
              <Button id="scene-pass" aria-disabled={!view.canPass} onClick={() => actions.passTurn()}>{t("scene.pass")}</Button>
              <DoneButton disabled={!view.canWrite} onClick={submit} />
            </div>
          </div>
          )}
        </>
      )}
    </section>
  );
}
