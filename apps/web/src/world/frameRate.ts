// world/frameRate.ts — el tope de cuadros del canvas (plan estetica-c M6, 03 §2.7.1 y §2.7.4), en funciones puras para
// testearlas sin GPU: con una escena de conversación arriba el canvas dibuja a 30 FPS como máximo (libera CPU para el
// audio y el WebSocket); fuera de la charla manda el `targetFps` del tier. FrameRegulator.tsx las aplica cada cuadro
// del navegador. Mientras dura el tope de la charla no se mide rendimiento: si PerformanceMonitor viera esos 30 FPS los
// tomaría por una caída y bajaría el tier por un límite propio.
//
// Reloj de plazos: cada cuadro dibujado corre el plazo un intervalo exacto (1000 / tope), así en cualquier ventana se
// dibujan a lo sumo los plazos que vencieron más uno (nunca se pasa del tope en promedio) y la fase no deriva en
// pantallas cuyo período no divide al intervalo (75 o 144 Hz). Si el navegador se trabó y el plazo quedó atrás, se
// vuelve a sincronizar en vez de dibujar una ráfaga para ponerse al día.

/** Margen contra el temblor de requestAnimationFrame: a 60 Hz con tope 60 no se saltea ningún cuadro. */
export const FRAME_SLACK_MS = 2;

/** El tope que manda: el menor entre el de la charla y el del tier (null = sin tope). */
export function frameCap(conversationFps: number | null, tierFps: number | null): number | null {
  const caps = [conversationFps, tierFps].filter((x): x is number => x !== null && Number.isFinite(x) && x > 0);
  return caps.length > 0 ? Math.min(...caps) : null;
}

/** ¿Toca dibujar? `now` y `deadline` en ms del mismo reloj (el plazo del próximo cuadro). */
export const frameDue = (now: number, deadline: number): boolean => now >= deadline - FRAME_SLACK_MS;

/**
 * El plazo siguiente después de dibujar en `now`: un intervalo después del anterior; si así quedaría en el pasado (el
 * navegador se trabó más de un intervalo), un intervalo después de ahora.
 */
export function nextDeadline(deadline: number, now: number, maxFps: number): number {
  const interval = 1000 / maxFps;
  const next = deadline + interval;
  return next <= now ? now + interval : next;
}

/** PerformanceMonitor mide solo fuera del tope de la charla (nunca baja ni sube el tier mientras se habla, §2.7.2.2). */
export const monitorActive = (conversationFps: number | null): boolean => conversationFps === null;

/** Los bounds por defecto de drei PerformanceMonitor (los que se usan sin tope que muerda). */
export const DREI_DEFAULT_BOUNDS = (refreshrate: number): [number, number] => (refreshrate > 100 ? [60, 100] : [40, 60]);

/**
 * Bounds de PerformanceMonitor según el tope de cuadros (nota 2 de QA en M6). drei declina cuando el promedio cae
 * debajo de `lower`, y su `refreshrate` es el máximo de FPS que midió, que con tope es el tope mismo: con los bounds por
 * defecto un tope de 30 da [40, 60] y el monitor tomaría su propio tope por una caída cada ~2,5 s. Con tope, los bounds
 * salen del tope (no de lo medido, para que una PC que no llega al tope siga declinando) con la proporción del default
 * de 60 Hz: 2/3 abajo, el tope arriba. A 30 FPS, [20, 30]; a 60, [40, 60] (el default). Sin tope, el default de drei.
 */
export function monitorBounds(cap: number | null): (refreshrate: number) => [number, number] {
  return (refreshrate) => (cap === null ? DREI_DEFAULT_BOUNDS(refreshrate) : [(cap * 2) / 3, cap]);
}

/** Lo que el canvas hace con el bucle de cuadros: modo de R3F, tope del regulador y PerformanceMonitor. */
export interface CanvasLoop {
  /** "demand" con un panel que pausa o con tope (el regulador pide los cuadros); "always" sin tope. */
  frameloop: "always" | "demand";
  /** Tope que aplica FrameRegulator; null = no se monta (pausado o sin tope). */
  regulatorFps: number | null;
  /** PerformanceMonitor con sus bounds; null = no se monta (durante la charla). */
  monitor: { bounds: (refreshrate: number) => [number, number] } | null;
}

/**
 * El bucle de cuadros del canvas como función pura (nota 1 de QA en M6): GameCanvas solo aplica lo que esto devuelve,
 * así un cambio que monte el monitor en la charla o deje el canvas en "always" con tope rompe un test.
 */
export function canvasLoop(render: { paused: boolean; conversationFps: number | null }, tierFps: number | null): CanvasLoop {
  const cap = frameCap(render.conversationFps, tierFps);
  return {
    frameloop: render.paused || cap !== null ? "demand" : "always",
    regulatorFps: !render.paused && cap !== null ? cap : null,
    monitor: monitorActive(render.conversationFps) ? { bounds: monitorBounds(cap) } : null,
  };
}

/**
 * Cuadros dibujados en `durationMs` con una pantalla de `displayHz` y un tope `maxFps` (simulación del regulador, para
 * los tests y para razonar el margen). `jitterMs(i)` corre el i-ésimo cuadro del navegador.
 */
export function simulateFrames(displayHz: number, maxFps: number, durationMs: number, jitterMs: (i: number) => number = () => 0): number {
  const vsync = 1000 / displayHz;
  let deadline = 1000 / maxFps;
  let drawn = 0;
  for (let i = 1; i * vsync <= durationMs; i++) {
    const now = i * vsync + jitterMs(i);
    if (!frameDue(now, deadline)) continue;
    deadline = nextDeadline(deadline, now, maxFps);
    drawn += 1;
  }
  return drawn;
}
