// Chromium launcher per GL mode (open-world-3d T2(f), D-833, D-834, AC12), shared by the walk
// (browser-walk.ts) and the performance probe (perf-probe.ts). `LG_GL=gpu|igpu|swiftshader` (default `gpu`):
//   gpu          ANGLE d3d11 on the high-performance GPU (--force_high_performance_gpu): NVIDIA on the operator's laptop
//   igpu         ANGLE d3d11 on the integrated one (--force_low_power_gpu); if the renderer is not AMD and LG_IGPU_LUID is set, it is
//                relaunched with --use-adapter-luid=<luid> and the log says that fallback was used
//   swiftshader  software render (what existed before T2)
// The unmasked WebGL renderer is read and the run fails if it does not match the mode: `gpu` fails ON PURPOSE on
// a machine without NVIDIA (strict-local). An unknown mode exits with an error before opening a browser.
//
// Hard rules: the browser is ALWAYS closed (try/finally in `withGlBrowser`, also on failure and with
// `--fail-on-purpose`), and only own PIDs are killed (this module kills nothing by name).
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

export const GL_MODES = ["gpu", "igpu", "swiftshader"] as const;
export type GlMode = (typeof GL_MODES)[number];

/** The viewport of the walk and the probe (D-834, smaller amendments: 1280x720 at DPR 1, the mockup's resolution). */
export const VIEWPORT = { width: 1280, height: 720 } as const;

/** What the unmasked renderer has to say in each mode. */
export const RENDERER_PATTERN: Readonly<Record<GlMode, RegExp>> = {
  gpu: /NVIDIA/i,
  igpu: /AMD|Radeon/i,
  swiftshader: /SwiftShader/i,
};

/** `LG_GL` (or `--gl=`) to a mode; with no value, `gpu`; an unknown value is an error (before launching anything). */
export function parseGlMode(value: string | undefined): GlMode {
  if (value === undefined || value === "") return "gpu";
  if ((GL_MODES as readonly string[]).includes(value)) return value as GlMode;
  throw new Error(`modo de GL desconocido "${value}" (usá ${GL_MODES.join(", ")})`);
}

const COMMON = ["--ignore-gpu-blocklist", "--enable-webgl"];

/** Chromium flags of the mode. `uncapped` adds the probe's (no vsync or frame cap). */
export function glArgs(mode: GlMode, opts: { uncapped?: boolean; adapterLuid?: string | undefined } = {}): string[] {
  const base = mode === "swiftshader"
    ? ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", ...COMMON]
    : ["--use-angle=d3d11", "--use-gl=angle", "--enable-gpu", ...COMMON,
      mode === "gpu" ? "--force_high_performance_gpu" : "--force_low_power_gpu",
      ...(mode === "igpu" && opts.adapterLuid ? [`--use-adapter-luid=${opts.adapterLuid}`] : [])];
  return opts.uncapped ? [...base, "--disable-gpu-vsync", "--disable-frame-rate-limit"] : base;
}

/** null if the renderer matches the mode; otherwise, the reason (the run fails with it). */
export function rendererMismatch(mode: GlMode, renderer: string): string | null {
  return RENDERER_PATTERN[mode].test(renderer) ? null : `el renderer "${renderer}" no es el del modo ${mode} (${RENDERER_PATTERN[mode]})`;
}

/** The unmasked WebGL2 renderer of a page (a separate canvas: it does not touch the game's). */
export const readRenderer = (page: Page): Promise<string> => page.evaluate(`(() => {
  const gl = document.createElement("canvas").getContext("webgl2");
  if (!gl) return "sin webgl2";
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
})()`);

export interface GlLaunch {
  mode: GlMode;
  renderer: string;
  /** true if igpu needed the --use-adapter-luid fallback. */
  adapterLuidFallback: boolean;
  args: string[];
}

export interface GlBrowserOptions {
  mode: GlMode;
  headless?: boolean;
  uncapped?: boolean;
  viewport?: { width: number; height: number };
  deviceScaleFactor?: number;
  /** Throws an error with the browser open (QA checks that no chromium is left alive). */
  failOnPurpose?: boolean;
  /** For the igpu fallback. */
  env?: NodeJS.ProcessEnv;
  log?: (s: string) => void;
  /** Script that runs before the page (e.g. the probe's memory hook). */
  initScript?: string;
}

/** Live browsers of this process (to close them on SIGINT/SIGTERM). */
const live = new Set<Browser>();
export const closeAllGlBrowsers = async (): Promise<void> => {
  await Promise.all([...live].map((b) => b.close().catch(() => undefined)));
  live.clear();
};

/** Close with a time limit: each step is tried even if the previous one fails. */
async function closeBrowser(context: BrowserContext | null, browser: Browser | null): Promise<void> {
  const bounded = (p: Promise<unknown> | undefined): Promise<unknown> =>
    Promise.race([p ?? Promise.resolve(), new Promise((r) => setTimeout(r, 10_000))]).catch(() => undefined);
  await bounded(context?.close());
  await bounded(browser?.close());
  if (browser) live.delete(browser);
}

/** Launches, opens a page and reads the renderer; the caller closes (closeBrowser). */
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
 * Opens Chromium in the requested mode, checks the renderer and runs `run`; the `finally` closes the browser no matter what
 * happens. A renderer that does not match the mode is an error (the run fails).
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
