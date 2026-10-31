// Dialogue HUD (F4.2; GDD §2.6, 03 §2.6, R14). ONE SINGLE component for both surfaces: over the map canvas
// (`surface="canvas"`) and in dialog-only mode (`surface="dialogOnly"`); only the frame changes. Shows the
// history with subtitles, the text input with "Done" (closes the turn), "Pass the turn" and its 4 options,
// the silent hint chip at 10 s (D-035, can be turned off) and the glossary on tapping a word according to the build
// (D-131); a word with no entry is marked for review, never translated (D-068). Keyboard first.
// F5.2: in a voice scene, instead of the text box: "Speak" (hold = push-to-talk; tap
// once opens the turn and "Done" closes it), a "listening / thinking" indicator, what is being heard and the
// microphone meter. Without a microphone or permission the scene goes by text and says why.
// A2 (ADR-027): in a free meter-based conversation, the meter panel, "What you know about…" and the help ladder
// (ConversationPanel), in voice and in text.
// Plan estetica-c M4 (proposal C §8, "paper and ink"): over the map, a paper card at bottom center (up to 47.5rem)
// with the amber name chip, the larger NPC line, the new word underlined with dots, the turn indicator
// (gray dot "speaking", pulsing green dot "your turn", still with "reduce motion") and the scaffolding bar
// with Done, the dark button, on the right. Same structure, same ids: tokens and layout change. All in rem.
// Reads view-models from state/selectors and dispatches state/actions: it knows neither the network nor the protocol.
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
 * Order of the scaffolding bar from proposal C §8: Repeat · Slower · Hint · Write · Done. The
 * "Pass the turn" options go in that order (`simpler` is the closest to "Slower"; `continue` is not in
 * the proposal and goes at the end of the group) and Done closes the bar, on the right.
 * M4 SEAM: "Write" (switching from voice to text within the same scene) requires changing the turn and
 * modality logic, outside M4; when it exists it goes between `hint` and Done.
 */
export const PASS_OPTIONS: readonly PassChoice[] = ["repeat", "simpler", "hint", "continue"];

const FRAME: Record<HudSurface, string> = {
  dialogOnly: "mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-6",
  // Over the map: paper card at bottom center, opaque, receiving the pointer (the rest of the shell lets it through to
  // the canvas). Max height ~45 % so it does not cover the two-shot (plan estetica-c M1 item 16); what does not fit scrolls
  // inside. Width up to 47.5rem (proposal C §8).
  canvas: "pointer-events-auto fixed inset-x-3 bottom-3 mx-auto flex max-h-[45dvh] max-w-[47.5rem] flex-col gap-3 overflow-y-auto rounded-card border-2 border-card-line bg-paper p-4 shadow-card",
};

type DotKind = "speaking" | "turn" | "listening";
const DOT_CLASS: Readonly<Record<DotKind, string>> = {
  speaking: "bg-line",
  turn: "bg-turn",
  listening: "bg-danger",
};

/** Turn indicator dot. Pulses only on your turn and never with "reduce motion" (`data-pulse`). */
function TurnDot({ kind, reduceMotion }: { kind: DotKind; reduceMotion: boolean }) {
  const pulse = kind === "turn" && !reduceMotion;
  return (
    <span
      aria-hidden="true" data-testid="turn-dot" data-dot={kind} data-pulse={String(pulse)}
      className={`inline-block h-3 w-3 shrink-0 rounded-full ${DOT_CLASS[kind]} ${pulse ? "lg-pulse" : ""}`}
    />
  );
}

/** Done: the dark button on the right of the bar. Space and Enter activate it (native button); the key is shown. */
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
  /** Id of the button that opened it (focus returns there on close). */
  from: string;
}

/** Hint chip: runs only in `waiting`, with the setting on and nothing typed; any change resets it. */
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
 * The phrase for the cause of a `model_unavailable` (open-world-3d T1). Only `http` with a status carries a number; with no status
 * (network down) the phrase goes without a code, never "null".
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

/** Holding "Speak" at least this long (ms) counts as push-to-talk: on release the turn closes. Shorter is a tap. */
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

/** Voice controls: Speak (hold or tap), Done, Pass the turn, indicator, what was heard and the meter. */
function voiceDot(v: VoiceHudView): DotKind {
  if (v.phase === "listening") return "listening";
  return v.phase === "yourTurn" ? "turn" : "speaking";
}

function VoiceControls({ v, npcName, canPass, reduceMotion }: { v: VoiceHudView; npcName: string | null; canPass: boolean; reduceMotion: boolean }) {
  const talk = useRef<HTMLButtonElement>(null);
  const pressedAt = useRef<number | null>(null);

  // Keyboard first: when your turn comes back, focus goes to "Speak".
  const canTalk = v.canTalk;
  useEffect(() => {
    if (canTalk && !document.getElementById("word-title")) talk.current?.focus();
  }, [canTalk]);

  const release = (): void => {
    const at = pressedAt.current;
    pressedAt.current = null;
    if (at !== null && Date.now() - at >= HOLD_TO_TALK_MS) actions.voiceTalkEnd();
  };
  // Keyboard (click without pointer, detail = 0): Space/Enter opens the turn and, again, closes it.
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
  // The NPC line is larger (proposal C §8: 22 over 16, i.e. 1.375rem; scales with the text size).
  const big = line.who === "npc";
  // Words with roving tabindex: Tab enters the line at the first word; the arrows move through the rest.
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

  // Keyboard first: when your turn COMES BACK, focus goes to the text box (unless you are reading a word).
  // Only on the canWrite transition: closing a word's card returns focus to the word, not to the box.
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
          {/* The amber name chip (proposal C §8): chip text on amber ≥ 7:1, with the dark border. */}
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
