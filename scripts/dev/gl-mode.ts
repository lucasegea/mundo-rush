// Lanzador de Chromium por modo de GL (open-world-3d T2(f), D-833, D-834, AC12), compartido por la caminata
// (browser-walk.ts) y la sonda de rendimiento (perf-probe.ts). `LG_GL=gpu|igpu|swiftshader` (default `gpu`):
//   gpu          ANGLE d3d11 en la GPU de alto rendimiento (--force_high_performance_gpu): NVIDIA en la laptop del operador
//   igpu         ANGLE d3d11 en la integrada (--force_low_power_gpu); si el renderer no es AMD y hay LG_IGPU_LUID, se
//                relanza con --use-adapter-luid=<luid> y el log dice que se usó ese respaldo
//   swiftshader  render por software (lo de antes de T2)
// Se lee el renderer desenmascarado de WebGL y la corrida falla si no coincide con el modo: `gpu` falla A PROPÓSITO en
// una máquina sin NVIDIA (estricto-local). Un modo desconocido sale con error antes de abrir un navegador.
//
// Reglas duras: el navegador SIEMPRE se cierra (try/finally en `withGlBrowser`, también en falla y con
// `--fail-on-purpose`), y solo se matan PIDs propios (este módulo no mata nada por nombre).
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

export const GL_MODES = ["gpu", "igpu", "swiftshader"] as const;
export type GlMode = (typeof GL_MODES)[number];

/** El viewport de la caminata y de la sonda (D-834, smaller amendments: 1280x720 a DPR 1, la resolución del mockup). */
export const VIEWPORT = { width: 1280, height: 720 } as const;

/** Lo que tiene que decir el renderer desenmascarado en cada modo. */
export const RENDERER_PATTERN: Readonly<Record<GlMode, RegExp>> = {
  gpu: /NVIDIA/i,
  igpu: /AMD|Radeon/i,
  swiftshader: /SwiftShader/i,
};

/** `LG_GL` (o `--gl=`) a un modo; sin valor, `gpu`; un valor desconocido es un error (antes de lanzar nada). */
export function parseGlMode(value: string | undefined): GlMode {
  if (value === undefined || value === "") return "gpu";
  if ((GL_MODES as readonly string[]).includes(value)) return value as GlMode;
  throw new Error(`modo de GL desconocido "${value}" (usá ${GL_MODES.join(", ")})`);
}

const COMMON = ["--ignore-gpu-blocklist", "--enable-webgl"];

/** Banderas de Chromium del modo. `uncapped` suma las de la sonda (sin vsync ni tope de cuadros). */
export function glArgs(mode: GlMode, opts: { uncapped?: boolean; adapterLuid?: string | undefined } = {}): string[] {
  const base = mode === "swiftshader"
    ? ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", ...COMMON]
    : ["--use-angle=d3d11", "--use-gl=angle", "--enable-gpu", ...COMMON,
      mode === "gpu" ? "--force_high_performance_gpu" : "--force_low_power_gpu",
      ...(mode === "igpu" && opts.adapterLuid ? [`--use-adapter-luid=${opts.adapterLuid}`] : [])];
  return opts.uncapped ? [...base, "--disable-gpu-vsync", "--disable-frame-rate-limit"] : base;
}

/** null si el renderer coincide con el modo; si no, el motivo (la corrida falla con él). */
export function rendererMismatch(mode: GlMode, renderer: string): string | null {
  return RENDERER_PATTERN[mode].test(renderer) ? null : `el renderer "${renderer}" no es el del modo ${mode} (${RENDERER_PATTERN[mode]})`;
}

/** El renderer desenmascarado de WebGL2 de una página (un canvas aparte: no toca el del juego). */
export const readRenderer = (page: Page): Promise<string> => page.evaluate(`(() => {
  const gl = document.createElement("canvas").getContext("webgl2");
  if (!gl) return "sin webgl2";
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
})()`);

export interface GlLaunch {
  mode: GlMode;
  renderer: string;
  /** true si igpu necesitó el respaldo --use-adapter-luid. */
  adapterLuidFallback: boolean;
  args: string[];
}

export interface GlBrowserOptions {
  mode: GlMode;
  headless?: boolean;
  uncapped?: boolean;
  viewport?: { width: number; height: number };
  deviceScaleFactor?: number;
  /** Lanza un error con el navegador abierto (QA comprueba que no queda ningún chromium vivo). */
  failOnPurpose?: boolean;
  /** Para el respaldo de igpu. */
  env?: NodeJS.ProcessEnv;
  log?: (s: string) => void;
  /** Script que corre antes que la página (p. ej. el gancho de memoria de la sonda). */
  initScript?: string;
}

/** Navegadores vivos de este proceso (para cerrarlos ante SIGINT/SIGTERM). */
const live = new Set<Browser>();
export const closeAllGlBrowsers = async (): Promise<void> => {
  await Promise.all([...live].map((b) => b.close().catch(() => undefined)));
  live.clear();
};

/** Cierre con tope de tiempo: cada paso se intenta aunque el anterior falle. */
async function closeBrowser(context: BrowserContext | null, browser: Browser | null): Promise<void> {
  const bounded = (p: Promise<unknown> | undefined): Promise<unknown> =>
    Promise.race([p ?? Promise.resolve(), new Promise((r) => setTimeout(r, 10_000))]).catch(() => undefined);
  await bounded(context?.close());
  await bounded(browser?.close());
  if (browser) live.delete(browser);
}

/** Lanza, abre una página y lee el renderer; el que llama cierra (closeBrowser). */
async function launchOnce(exe: string, o: GlBrowserOptions, adapterLuid?: string): Promise<{ browser: Browser; context: BrowserContext; page: Page; renderer: string; args: string[] }> {
  const args = glArgs(o.mode, { uncapped: o.uncapped ?? false, adapterLuid });
  const browser = await chromium.launch({ executablePath: exe, headless: o.headless ?? true, args });
  live.add(browser);
  try {
    const context = await browser.newContext({ viewport: o.viewport ?? VIEWPORT, deviceScaleFactor: o.deviceScaleFactor ?? 1 });
    if (o.initScript) await context.addInitScript(o.initScript);
    const page = await context.newPage();
    const renderer = await readRenderer(page);
    return { browser, context, page, renderer, args };
  } catch (e) {
    await closeBrowser(null, browser);
    throw e;
  }
}

/**
 * Abre Chromium en el modo pedido, verifica el renderer y corre `run`; el `finally` cierra el navegador pase lo que
 * pase. Un renderer que no coincide con el modo es un error (la corrida falla).
 */
export async function withGlBrowser<T>(exe: string, o: GlBrowserOptions, run: (page: Page, info: GlLaunch) => Promise<T>): Promise<T> {
  const log = o.log ?? ((s: string) => console.log(s));
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  try {
    let r = await launchOnce(exe, o);
    browser = r.browser;
    context = r.context;
    let fallback = false;
    const luid = (o.env ?? process.env)["LG_IGPU_LUID"];
    if (o.mode === "igpu" && rendererMismatch("igpu", r.renderer) && luid) {
      log(`[gl] igpu: --force_low_power_gpu dio "${r.renderer}"; respaldo --use-adapter-luid=${luid}`);
      await closeBrowser(context, browser);
      browser = null;
      context = null;
      r = await launchOnce(exe, o, luid);
      browser = r.browser;
      context = r.context;
      fallback = true;
    }
    log(`[gl] modo ${o.mode}${fallback ? " (respaldo --use-adapter-luid)" : ""}: renderer ${r.renderer}`);
    const mismatch = rendererMismatch(o.mode, r.renderer);
    if (mismatch) throw new Error(mismatch);
    if (o.failOnPurpose) throw new Error("--fail-on-purpose: falla deliberada con el navegador abierto");
    return await run(r.page, { mode: o.mode, renderer: r.renderer, adapterLuidFallback: fallback, args: r.args });
  } finally {
    await closeBrowser(context, browser);
    log("[gl] navegador cerrado");
  }
}
