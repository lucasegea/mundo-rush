// Meter-based conversation panel (A2, ADR-027; the research report 2.5.D): animated bars with label and phase,
// "What you know about <name>" and the help ladder (Lumi's hint → suggested phrases). NO NUMBERS: each bar is a
// width, and for screen readers a word ("a little", "almost"). Works the same in voice and text: in text, tapping a
// phrase puts it in the box; in voice, it is read aloud. The help step is the higher of the server's (turns without
// progress) and the client's silence clock (only on your turn, waiting).
// Plan estetica-c M4 (proposal C §6 and §8): the meter is a paper card with a title ("Get to know <NPC>"), "N of M"
// and one segment per meter with its label. Achieved: full amber with dark border and bold label. Current:
// amber hatching (what is advanced, full amber). Pending: empty. State also goes by attribute (`data-state`) and by
// text for screen readers, never by color alone (amber on paper gives 1.85:1). "N of M" counts achieved meters,
// it is not a score: the rest of the card shows no numbers. Over the map the card sits at the top left
// (`floating`); on narrow screens it drops down and stays inside the dialogue panel.
import { useEffect, useState } from "react";
import { t, type MessageKey } from "../../i18n";
import type { ConversationUi } from "../../state/selectors";
import { Button } from "../primitives";

type MeterStatus = ConversationUi["meters"][number]["status"];

/** State of each segment, by attribute and by text (proposal C §8): achieved, current, pending. */
export const SEGMENT_STATE: Readonly<Record<MeterStatus, "logrado" | "actual" | "pendiente">> = {
  full: "logrado",
  active: "actual",
  locked: "pendiente",
};

/** Segment shape by state: dark border and filled (achieved), hatched (current), empty (pending). */
const SEGMENT_CLASS: Readonly<Record<MeterStatus, string>> = {
  full: "border-amber-strong bg-amber",
  active: "border-amber-strong bg-paper lg-stripes",
  locked: "border-line bg-surface",
};

const fillWord = (fill: number): MessageKey =>
  fill >= 1 ? "conv.fill.full" : fill >= 0.75 ? "conv.fill.most" : fill >= 0.4 ? "conv.fill.half" : fill > 0 ? "conv.fill.some" : "conv.fill.empty";

/** Help step from the client clock: goes up to 1 and 2 with silence; any change of `resetKey` resets it. */
export function useIdleHelp(active: boolean, delays: readonly [number, number], resetKey: string): 0 | 1 | 2 {
  const [level, setLevel] = useState<{ key: string; level: 0 | 1 | 2 }>({ key: resetKey, level: 0 });
  useEffect(() => {
    if (!active) return;
    const one = setTimeout(() => setLevel({ key: resetKey, level: 1 }), delays[0]);
    const two = setTimeout(() => setLevel({ key: resetKey, level: 2 }), delays[1]);
    return () => {
      clearTimeout(one);
      clearTimeout(two);
    };
  }, [active, delays, resetKey]);
  return active && level.key === resetKey ? level.level : 0;
}

export interface ConversationPanelProps {
  conv: ConversationUi;
  /** Your turn, waiting: the silence clock runs only here. */
  waiting: boolean;
  idleMs: readonly [number, number];
  /** Changes with each new line (resets the silence clock). */
  resetKey: string;
  /** Text: tapping a phrase puts it in the box. Voice: null (the phrase is read aloud). */
  onPhrase: ((phrase: string) => void) | null;
  /** Over the map: the meter card floats at the top left from medium screens up (M4). */
  floating?: boolean;
}

/** The meter card: title, "N of M", current phase and one segment per meter. */
function MeterCard({ conv, floating }: { conv: ConversationUi; floating: boolean }) {
  const active = conv.meters.find((m) => m.id === conv.activeMeter) ?? null;
  const done = conv.meters.filter((m) => m.status === "full").length;
  const place = floating ? "md:fixed md:left-4 md:top-4 md:z-20 md:w-[24rem] md:max-w-[calc(100vw-2rem)]" : "";
  return (
    <div data-testid="conv-meter" className={`flex flex-col gap-2 rounded-card border-2 border-card-line bg-paper p-3 shadow-card ${place}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-bold">{t("conv.title", { name: conv.npcName })}</h2>
        <p className="text-sm text-ink-muted" data-testid="conv-count">{t("conv.count", { done, total: conv.meters.length })}</p>
      </div>
      {active ? <p className="text-sm font-semibold" data-testid="conv-phase">{t("conv.phase", { label: active.label })}</p> : null}
      <ol className="grid auto-cols-fr grid-flow-col gap-2">
        {conv.meters.map((m) => (
          <li key={m.id} className="flex min-w-0 flex-col gap-1" data-meter={m.id} data-status={m.status} data-state={SEGMENT_STATE[m.status]}>
            <div
              role="img" aria-label={`${m.label}: ${m.status === "locked" ? t("conv.meter.locked") : t(fillWord(m.fill))}`}
              className={`h-3 w-full overflow-hidden rounded-full border-2 ${SEGMENT_CLASS[m.status]}`}
            >
              <div
                data-testid={`meter-fill-${m.id}`}
                className="h-full bg-amber transition-[width] duration-700 ease-out motion-reduce:transition-none"
                style={{ width: `${Math.round(m.fill * 100)}%` }}
              />
            </div>
            <span className={`text-xs leading-tight ${m.status === "full" ? "font-bold" : m.status === "locked" ? "text-ink-muted" : "font-semibold"}`}>
              {m.label}
              <span className="sr-only"> · {t(`conv.state.${m.status}`)}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ConversationPanel({ conv, waiting, idleMs, resetKey, onPhrase, floating = false }: ConversationPanelProps) {
  const idle = useIdleHelp(waiting && !conv.completed, idleMs, resetKey);
  const level = Math.max(conv.help.level, idle);
  return (
    <section aria-label={t("conv.region")} data-testid="conversation-panel" className="flex flex-col gap-3">
      <MeterCard conv={conv} floating={floating} />
      {conv.completed ? <p role="status" className="font-semibold" data-testid="conv-completed">{t("conv.completed", { name: conv.npcName })}</p> : null}
      {!conv.completed && conv.stalled ? <p className="text-sm">{t("conv.stalled", { name: conv.npcName })}</p> : null}
      <div>
        <h2 className="font-semibold">{t("conv.facts.title", { name: conv.npcName })}</h2>
        {conv.facts.length > 0 ? (
          <ul className="list-disc pl-5" data-testid="conv-facts">
            {conv.facts.map((f) => <li key={f.id}>{f.label}</li>)}
          </ul>
        ) : <p className="text-sm text-ink-muted">{t("conv.facts.empty")}</p>}
      </div>
      {!conv.completed && level >= 1 && conv.help.hint ? (
        <div className="flex flex-col gap-2 rounded-card border-2 border-card-line bg-surface p-2" data-testid="conv-help" data-level={level}>
          <p><span className="font-semibold">{t("conv.help.title")}:</span> {conv.help.hint}</p>
          {level >= 2 && conv.help.phrases.length > 0 ? (
            <div className="flex flex-col gap-1">
              <p className="text-sm text-ink-muted">{t("conv.help.phrases")}</p>
              <ul className="flex flex-wrap gap-2" data-testid="conv-phrases">
                {conv.help.phrases.map((p) => (
                  <li key={p}>
                    {onPhrase ? (
                      <Button variant="ghost" className="border-line" lang="en" aria-label={`${t("conv.help.usePhrase")}: ${p}`} onClick={() => onPhrase(p)}>{p}</Button>
                    ) : <span lang="en" className="inline-block rounded border border-line px-2 py-1">{p}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
