// world/budget/loadWarmup.ts — world loading (open-world-3d T10 (d), D-835, AC63): shaders are compiled with
// `renderer.compileAsync(scene, camera)` before the world's first frame (GameCanvas holds the frameloop until it
// finishes), and the first frame leaves the `lg:world-first-frame` mark with `renderer.info.programs.length` (through the bridge:
// world/ uses the core only as types), which is also logged once to the console. Pure over an injected compiler and
// mark; the R3F components that use it are in WorldLoad.tsx. T10-integrate: what arrives later
// (nature, characters, postprocessing) is precompiled on arrival with `precompile`, without holding the frameloop.

/**
 * If compileAsync does not finish in this time, the world is drawn anyway (it compiles on the first frame, as before T10).
 * Generous: on SwiftShader the whole compilation takes seconds and cutting it earlier would only move it to the first frame.
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

/** Compiles the scene's programs; never rejects (a failure or the time cap lets it draw anyway). */
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

/** What `precompile` uses of the renderer (WebGLRenderer): compile against the world's scene and change the target. */
export interface LateCompiler<O, C, S, T> {
  compileAsync(object: O, camera: C, targetScene?: S | null): Promise<unknown>;
  getRenderTarget(): T | null;
  setRenderTarget(target: T | null): void;
}

/**
 * T10-integrate: precompiles something that arrives after the first scene (nature meshes, character bodies,
 * postprocessing passes) without holding the frameloop. `scene` is the scene where it will be drawn (its lights and fog
 * enter the program) and `target` the frame's destination: null is the screen; with postprocessing the scene is drawn into
 * a render target and three builds another program (no tone mapping and in linear space), so it is compiled with one set. The
 * previous target returns right away: the synchronous part of compileAsync (building the programs) runs inside. Never rejects.
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

/** What is read from a pass of the postprocessing composer (by shape: world/ does not import postprocessing). */
export interface PassLike {
  scene?: unknown;
  camera?: unknown;
  fullscreenMaterial?: unknown;
  renderToScreen?: boolean;
}

export interface FullscreenPass {
  scene: unknown;
  camera: unknown;
  /** Draws to the screen (the last pass); otherwise, to a render target. */
  screen: boolean;
}

const isPass = (v: unknown): v is PassLike =>
  typeof v === "object" && v !== null && "fullscreenMaterial" in v && (v as PassLike).fullscreenMaterial != null &&
  (v as PassLike).scene != null && (v as PassLike).camera != null;

/**
 * The full-screen scenes of a composer to precompile them: each pass with a material (the RenderPass has none;
 * its scene is the world's) and the internal passes of its effects (the bloom's threshold and blur), without repeats.
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

/** Was `programs.length` already logged? (once per page, even if the canvas remounts). */
let programsLogged = false;

/**
 * The world's first frame: marks `lg:world-first-frame` with `mark` (bridge.worldFirstFrame in the app) and logs the
 * programs only once. Returns what `mark` returns (whether it marked).
 */
export function reportFirstFrame(mark: (programs: number) => boolean, programs: number, log: (msg: string) => void = (m) => console.info(m)): boolean {
  if (!programsLogged) {
    programsLogged = true;
    log(`[mundo] primer cuadro: ${programs} programas compilados (renderer.info.programs.length)`);
  }
  return mark(programs);
}

/** Tests only: allows the console log again. */
export function resetFirstFrameLog(): void {
  programsLogged = false;
}
