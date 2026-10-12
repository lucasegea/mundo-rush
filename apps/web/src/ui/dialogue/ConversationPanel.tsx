// Panel de la conversación por medidores (A2, ADR-027; informe de investigación 2.5.D): barras animadas con etiqueta y fase,
// "Lo que sabés de <nombre>" y la escalera de ayuda (pista de Lumi → frases sugeridas). SIN NÚMEROS: cada barra es un
// ancho, y para lectores de pantalla una palabra ("un poco", "casi"). Anda igual en voz y en texto: en texto, tocar una
// frase la pone en la caja; en voz, se lee en voz alta. El escalón de ayuda es el mayor entre el del servidor (turnos sin
// progreso) y el del reloj de silencio del cliente (solo en tu turno esperando).
import { useEffect, useState } from "react";
import { t, type MessageKey } from "../../i18n";
import type { ConversationUi } from "../../state/selectors";
import { Button } from "../primitives";

const fillWord = (fill: number): MessageKey =>
  fill >= 1 ? "conv.fill.full" : fill >= 0.75 ? "conv.fill.most" : fill >= 0.4 ? "conv.fill.half" : fill > 0 ? "conv.fill.some" : "conv.fill.empty";

/** Escalón de ayuda del reloj del cliente: sube a 1 y a 2 con el silencio; cualquier cambio de `resetKey` lo reinicia. */
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
  /** Tu turno esperando: el reloj de silencio corre solo acá. */
  waiting: boolean;
  idleMs: readonly [number, number];
  /** Cambia con cada línea nueva (reinicia el reloj de silencio). */
  resetKey: string;
  /** Texto: tocar una frase la pone en la caja. Voz: null (la frase se lee en voz alta). */
  onPhrase: ((phrase: string) => void) | null;
}

export function ConversationPanel({ conv, waiting, idleMs, resetKey, onPhrase }: ConversationPanelProps) {
  const idle = useIdleHelp(waiting && !conv.completed, idleMs, resetKey);
  const level = Math.max(conv.help.level, idle);
  const active = conv.meters.find((m) => m.id === conv.activeMeter) ?? null;
  return (
    <section aria-label={t("conv.region")} data-testid="conversation-panel" className="flex flex-col gap-3 rounded-lg border-2 border-line bg-paper p-3">
      {active ? <p className="font-semibold" data-testid="conv-phase">{t("conv.phase", { label: active.label })}</p> : null}
      <ul className="flex flex-col gap-2">
        {conv.meters.map((m) => (
          <li key={m.id} className="flex flex-col gap-1" data-meter={m.id} data-status={m.status}>
            <span className={`text-sm ${m.status === "locked" ? "text-ink-muted" : "font-semibold"}`}>
              {m.label} · {t(`conv.meter.${m.status}`)}
            </span>
            <div
              role="img" aria-label={`${m.label}: ${m.status === "locked" ? t("conv.meter.locked") : t(fillWord(m.fill))}`}
              className="h-3 w-full overflow-hidden rounded-full border border-line bg-surface"
            >
              <div
                data-testid={`meter-fill-${m.id}`}
                className={`h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none ${m.status === "full" ? "bg-accent" : "bg-accent-soft"}`}
                style={{ width: `${Math.round(m.fill * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
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
        <div className="flex flex-col gap-2 rounded-lg border-2 border-accent-soft bg-surface p-2" data-testid="conv-help" data-level={level}>
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
