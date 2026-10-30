// world/budget/loadWarmup.ts — carga del mundo (open-world-3d T10 (d), D-835, AC63): los sombreadores se compilan con
// `renderer.compileAsync(scene, camera)` antes del primer cuadro del mundo (GameCanvas retiene el frameloop hasta que
// termina), y el primer cuadro deja la marca `lg:world-first-frame` con `renderer.info.programs.length` (por el puente:
// world/ usa el núcleo solo como tipos), que además se registra una vez en la consola. Puro sobre un compilador y una
// marca inyectados; los componentes de R3F que lo usan están en WorldLoad.tsx. T10-integrate: lo que llega después
// (naturaleza, personajes, postprocesado) se precompila al llegar con `precompile`, sin retener el frameloop.

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

/** Lo que `precompile` usa del renderer (WebGLRenderer): compilar contra la escena del mundo y cambiar el destino. */
export interface LateCompiler<O, C, S, T> {
  compileAsync(object: O, camera: C, targetScene?: S | null): Promise<unknown>;
  getRenderTarget(): T | null;
  setRenderTarget(target: T | null): void;
}

/**
 * T10-integrate: precompila algo que llega después de la primera escena (mallas de la naturaleza, cuerpos de personajes,
 * pasadas del postprocesado) sin retener el frameloop. `scene` es la escena donde se va a dibujar (sus luces y su niebla
 * entran en el programa) y `target` el destino del cuadro: null es la pantalla; con postprocesado la escena se dibuja en
 * un render target y three arma otro programa (sin tono y en espacio lineal), así que se compila con uno puesto. El
 * destino anterior vuelve enseguida: la parte síncrona de compileAsync (armar los programas) corre adentro. Nunca rechaza.
 */
export function precompile<O, C, S, T>(
  renderer: LateCompiler<O, C, S, T>, object: O, camera: C, scene: S, target: T | null,
  timeoutMs = SHADER_WARMUP_TIMEOUT_MS, timers: WarmupTimers = browserTimers,
): Promise<WarmupResult> {
  const prev = renderer.getRenderTarget();
  const swap = prev !== target;
  try {
    if (swap) renderer.setRenderTarget(target);
    return warmShaders({ compileAsync: (o: O, c: C) => renderer.compileAsync(o, c, scene) }, object, camera, timeoutMs, timers);
  } catch {
    return Promise.resolve("failed");
  } finally {
    if (swap) renderer.setRenderTarget(prev);
  }
}

/** Lo que se lee de una pasada del composer de postprocessing (por forma: world/ no importa postprocessing). */
export interface PassLike {
  scene?: unknown;
  camera?: unknown;
  fullscreenMaterial?: unknown;
  renderToScreen?: boolean;
}

export interface FullscreenPass {
  scene: unknown;
  camera: unknown;
  /** Dibuja en la pantalla (la última pasada); si no, en un render target. */
  screen: boolean;
}

const isPass = (v: unknown): v is PassLike =>
  typeof v === "object" && v !== null && "fullscreenMaterial" in v && (v as PassLike).fullscreenMaterial != null &&
  (v as PassLike).scene != null && (v as PassLike).camera != null;

/**
 * Las escenas de pantalla completa de un composer para precompilarlas: cada pasada con material (la RenderPass no tiene;
 * su escena es la del mundo) y las pasadas internas de sus efectos (el umbral y el desenfoque del bloom), sin repetir.
 */
export function fullscreenPasses(composer: { passes: readonly unknown[] }): FullscreenPass[] {
  const out: FullscreenPass[] = [];
  const seen = new Set<unknown>();
  const add = (p: PassLike, screen: boolean): void => {
    if (seen.has(p.scene)) return;
    seen.add(p.scene);
    out.push({ scene: p.scene, camera: p.camera, screen });
  };
  for (const pass of composer.passes) {
    if (isPass(pass)) add(pass, pass.renderToScreen === true);
    const effects = (pass as { effects?: unknown }).effects;
    if (!Array.isArray(effects)) continue;
    for (const effect of effects as unknown[]) {
      if (typeof effect !== "object" || effect === null) continue;
      for (const inner of Object.values(effect)) if (isPass(inner)) add(inner, false);
    }
  }
  return out;
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
