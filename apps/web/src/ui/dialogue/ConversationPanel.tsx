// Panel de la conversación por medidores (A2, ADR-027; informe de investigación 2.5.D): barras animadas con etiqueta y fase,
// "Lo que sabés de <nombre>" y la escalera de ayuda (pista de Lumi → frases sugeridas). SIN NÚMEROS: cada barra es un
// ancho, y para lectores de pantalla una palabra ("un poco", "casi"). Anda igual en voz y en texto: en texto, tocar una
// frase la pone en la caja; en voz, se lee en voz alta. El escalón de ayuda es el mayor entre el del servidor (turnos sin
// progreso) y el del reloj de silencio del cliente (solo en tu turno esperando).
// Plan estetica-c M4 (propuesta C §6 y §8): el medidor es una tarjeta de papel con título ("Conocer a <NPC>"), "N de M"
// y un segmento por medidor con su etiqueta. Logrado: ámbar lleno con borde oscuro y etiqueta en negrita. Actual:
// rayado ámbar (lo avanzado, ámbar lleno). Pendiente: vacío. El estado va además por atributo (`data-state`) y por
// texto para lectores de pantalla, nunca solo por color (el ámbar sobre el papel da 1,85:1). "N de M" cuenta medidores
// logrados, no es un puntaje: el resto de la tarjeta no muestra números. Sobre el mapa la tarjeta va arriba a la
// izquierda (`floating`); en pantallas angostas baja y queda dentro del panel de diálogo.
import { useEffect, useState } from "react";
import { t, type MessageKey } from "../../i18n";
import type { ConversationUi } from "../../state/selectors";
import { Button } from "../primitives";

type MeterStatus = ConversationUi["meters"][number]["status"];

/** Estado de cada segmento, por atributo y por texto (propuesta C §8): logrado, actual, pendiente. */
export const SEGMENT_STATE: Readonly<Record<MeterStatus, "logrado" | "actual" | "pendiente">> = {
  full: "logrado",
  active: "actual",
  locked: "pendiente",
};

/** Forma del segmento por estado: borde oscuro y lleno (logrado), rayado (actual), vacío (pendiente). */
const SEGMENT_CLASS: Readonly<Record<MeterStatus, string>> = {
  full: "border-amber-strong bg-amber",
  active: "border-amber-strong bg-paper lg-stripes",
  locked: "border-line bg-surface",
};

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
  /** Sobre el mapa: la tarjeta del medidor flota arriba a la izquierda desde pantallas medianas (M4). */
  floating?: boolean;
}

/** La tarjeta del medidor: título, "N de M", fase actual y un segmento por medidor. */
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
