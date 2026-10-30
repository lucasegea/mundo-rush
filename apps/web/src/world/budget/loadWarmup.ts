// world/budget/loadWarmup.ts — carga del mundo (open-world-3d T10 (d), D-835, AC63): los sombreadores se compilan con
// `renderer.compileAsync(scene, camera)` antes del primer cuadro del mundo (GameCanvas retiene el frameloop hasta que
// termina), y el primer cuadro deja la marca `lg:world-first-frame` con `renderer.info.programs.length` (por el puente:
// world/ usa el núcleo solo como tipos), que además se registra una vez en la consola. Puro sobre un compilador y una
// marca inyectados; los componentes de R3F que lo usan están en WorldLoad.tsx.

/**
 * Si compileAsync no termina en este tiempo, el mundo se dibuja igual (compila en el primer cuadro, como antes de T10).
 * Holgado: en SwiftShader la compilación entera tarda segundos y cortarla antes solo la movería al primer cuadro.
 */
export const SHADER_WARMUP_TIMEOUT_MS = 10_000;

export type WarmupResult = "compiled" | "timeout" | "failed";

export interface ShaderCompiler<S, C> {
  compileAsync(scene: S, camera: C): Promise<unknown>;
}

export interface WarmupTimers {
  setTimeout(cb: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

const browserTimers: WarmupTimers = {
  setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
};

/** Compila los programas de la escena; nunca rechaza (un fallo o el tope de tiempo dejan dibujar igual). */
export function warmShaders<S, C>(
  renderer: ShaderCompiler<S, C>, scene: S, camera: C, timeoutMs = SHADER_WARMUP_TIMEOUT_MS, timers: WarmupTimers = browserTimers,
): Promise<WarmupResult> {
  return new Promise((resolve) => {
    const id = timers.setTimeout(() => resolve("timeout"), timeoutMs);
    const settle = (r: WarmupResult): void => {
      timers.clearTimeout(id);
      resolve(r);
    };
    let compiling: Promise<unknown>;
    try {
      compiling = renderer.compileAsync(scene, camera);
    } catch {
      settle("failed");
      return;
    }
    compiling.then(() => settle("compiled"), () => settle("failed"));
  });
}

/** ¿Ya se registró `programs.length`? (una vez por página, aunque el canvas se vuelva a montar). */
let programsLogged = false;

/**
 * El primer cuadro del mundo: marca `lg:world-first-frame` con `mark` (bridge.worldFirstFrame en la app) y registra los
 * programas una sola vez. Devuelve lo que devuelve `mark` (si marcó).
 */
export function reportFirstFrame(mark: (programs: number) => boolean, programs: number, log: (msg: string) => void = (m) => console.info(m)): boolean {
  if (!programsLogged) {
    programsLogged = true;
    log(`[mundo] primer cuadro: ${programs} programas compilados (renderer.info.programs.length)`);
  }
  return mark(programs);
}

/** Solo para tests: vuelve a permitir el registro de la consola. */
export function resetFirstFrameLog(): void {
  programsLogged = false;
}
