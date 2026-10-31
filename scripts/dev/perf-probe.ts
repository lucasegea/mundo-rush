// `npm run perf:probe` (open-world-3d T2(g), D-833, D-834, D-835, AC58): the performance probe. On demand and OUTSIDE
// `npm run verify`, like the walk. It starts its own scripted stack (scene server + Vite with
// VITE_LG_PERF_PROBE=1, which in development sets the canvas uncapped: frameloop "always" and no FrameRegulator, and leaves the
// hook world/budget/perfProbe.ts), opens Chromium through the shared launcher scripts/dev/gl-mode.ts (which checks the
// mode's renderer) with --disable-gpu-vsync --disable-frame-rate-limit, and per tier and pose measures 10 s of frames after
// 12 s of warm-up: mean, p50 and p95 in ms, `renderer.info` (calls, triangles, programs) and the GPU memory
// requested by type (port of the mockup's tools/mem.cjs; compressed formats at their block size). The main column
// is 1280x720 at DPR 1 (the gate's); DPR 1.5 and 1920x1080 are informational (O-5).
//
//   npm run perf:probe -- --gl=gpu|igpu|swiftshader --tier=low|medium|high|all --pose=spawn[,...] [--label=T3] [--build]
//                          [--factor=grass-off[,post-off]]
//
// `--factor` (open-world-3d T10 (b), D-846) passes development measurement factors to the page (`?factor=...`). The
// single registry is apps/web/src/world/budget/devFactors.ts; the probe does not copy it: after entering the map it reads the
// container's `data-lg-dev-factors` attribute (what the page recognized) and fails if any requested one is missing.
// Does not apply to `--build` (there are no factors in production). Since T10 (d) the measurement waits for the mark
// `lg:world-first-frame` (the frameloop stays held while compileAsync compiles the first scene).
//
// `--build` measures the load over a `vite build` served with `vite preview` (fresh browser profile per sample, 3
// samples at medium; D-835). Writes JSON and one section per label in
// (internal document) The browser is ALWAYS closed and only own PIDs are killed.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright-core";
import { enterWorld, findChromium, REPO_ROOT, startStack, UNIVERSE, WORLD_CANVAS, type Stack } from "./browser-walk.ts";
import { closeAllGlBrowsers, parseGlMode, VIEWPORT, withGlBrowser, type GlLaunch, type GlMode } from "./gl-mode.ts";

export const EVALS_DIR = join(REPO_ROOT, "(internal document)");
export const REPORT_MD = join(EVALS_DIR, "learning-game-open-world-3d-perf.md");
export const REPORT_JSON_DIR = join(EVALS_DIR, "learning-game-open-world-3d-perf");

export const WARMUP_MS = 12_000;
export const WINDOW_MS = 10_000;
export const LOAD_SAMPLES = 3;

export const TIERS = ["low", "medium", "high"] as const;
export type Tier = (typeof TIERS)[number];

/**
 * Camera poses. `spawn` is the default camera on entry (6 m behind); since open-world-3d T5 the continuous zoom of
 * `thirdPerson` gives `close` (t = 0, 2.5 m), `mid` (t = 0.5) and `full` (t = 1, the whole map), set with the store's
 * `zoomTo` action (the 12 s warm-up covers the smoothing). Since T6, `hilltop`: the player on the dock's HILLTOP hill
 * (95th percentile of walkable height) looking southeast with the three NPCs in view, at the entry
 * distance. A pose without `apply` is reported as "not available".
 */
export const POSES = ["spawn", "close", "mid", "full", "hilltop"] as const;
export type Pose = (typeof POSES)[number];
/** Zoom t of each continuous-zoom pose; `spawn` returns to the entry distance. */
export const POSE_ZOOM_T: Readonly<Partial<Record<Pose, number | "default">>> = { spawn: "default", close: 0, mid: 0.5, full: 1 };
const zoomPose = (t: number | "default") => async (page: Page): Promise<void> => {
  await page.evaluate(`(async () => {
    const { gameStore } = await import("/src/state/store.ts");
    const { actions } = await import("/src/state/actions.ts");
    const c = gameStore.getState().ui.camera;
    const t = ${JSON.stringify(t)} === "default" ? Math.log(6 / 2.5) / Math.log(c.fitDistance / 2.5) : ${JSON.stringify(t)};
    actions.zoomTo(t);
  })()`);
};
/**
 * The named pose `hilltop` of the dock (open-world-3d T6): at (-20, 20), 6.6 m (95th percentile of the walkable), with
 * yaw -31° (camera to the northwest, looking southeast): Mitayo, Cerro and Factor sit 28-32° from the view center,
 * inside the ±39.6° of the 50° horizontal FOV at 16:9 (perf-probe.test.ts proves it).
 */
export const HILLTOP = { x: -20, z: 20, yawDeg: -31 } as const;
const hilltopPose = async (page: Page): Promise<void> => {
  await page.evaluate(`(async () => {
    const { gameStore } = await import("/src/state/store.ts");
    const { actions } = await import("/src/state/actions.ts");
    const s = gameStore.getState();
    const g = s.world.diorama.grid;
    const p = { x: ${HILLTOP.x}, z: ${HILLTOP.z} };
    const cell = [Math.floor((p.x - g.originX) / g.cellSize), Math.floor((p.z - g.originZ) / g.cellSize)];
    gameStore.setState({
      player: { ...s.player, position: p, previous: p, cell, path: [] },
      ui: { ...s.ui, camera: { ...s.ui.camera, yawDeg: ${HILLTOP.yawDeg} } },
    });
    const c = gameStore.getState().ui.camera;
    actions.zoomTo(Math.log(6 / 2.5) / Math.log(c.fitDistance / 2.5));
  })()`);
};
/**
 * Open-world-3d M3 (QA's finding): with `--tier=all` the next tier's `spawn` pose inherited the player and yaw
 * of `hilltop`. On entering the world the spawn (position, cell, yaw) is saved and `spawn` restores it before the zoom.
 */
const SAVE_SPAWN = `import("/src/state/store.ts").then(({ gameStore }) => {
  const s = gameStore.getState();
  globalThis.__lgProbeSpawn = { position: s.player.position, cell: s.player.cell, yawDeg: s.ui.camera.yawDeg };
})`;
const spawnPose = async (page: Page): Promise<void> => {
  await page.evaluate(`(async () => {
    const { gameStore } = await import("/src/state/store.ts");
    const sp = globalThis.__lgProbeSpawn;
    if (!sp) throw new Error("perf-probe: sin aparición guardada");
    const s = gameStore.getState();
    gameStore.setState({
      player: { ...s.player, position: sp.position, previous: sp.position, cell: sp.cell, path: [] },
      ui: { ...s.ui, camera: { ...s.ui.camera, yawDeg: sp.yawDeg } },
    });
  })()`);
  await zoomPose("default")(page);
};
const POSE_APPLY: Partial<Record<Pose, (page: Page) => Promise<void>>> = {
  ...Object.fromEntries(Object.entries(POSE_ZOOM_T).map(([pose, t]) => [pose, zoomPose(t as number | "default")])),
  spawn: spawnPose,
  hilltop: hilltopPose,
};
export const poseAvailable = (p: Pose): boolean => POSE_APPLY[p] !== undefined;

/** Columns: the gate's and the two informational ones (O-5). */
export const CONFIGS = [
  { id: "main", viewport: VIEWPORT, dpr: 1 },
  { id: "dpr1.5", viewport: VIEWPORT, dpr: 1.5 },
  { id: "1920x1080", viewport: { width: 1920, height: 1080 }, dpr: 1 },
] as const;
export type ConfigId = (typeof CONFIGS)[number]["id"];

export interface ProbeArgs {
  gl: GlMode;
  tiers: Tier[];
  poses: Pose[];
  label: string;
  build: boolean;
  failOnPurpose: boolean;
  /** Development measurement factors (T10 (b)); empty = none. */
  factors: string[];
}

/** Shape of a factor name (the valid names are decided by the page's registry). */
const FACTOR_NAME = /^[a-z0-9][a-z0-9.-]*$/;
/** Query parameter and container attribute: those of apps/web/src/world/budget/devFactors.ts. */
export const FACTOR_PARAM = "factor";
export const FACTORS_ATTR = "data-lg-dev-factors";
/** The load marks of @lg/core (runtime/loadMarks.ts). */
export const MARK_ENTER = "lg:world-enter";
export const MARK_FIRST_FRAME = "lg:world-first-frame";

/** The page url with the universe, without voice and with the requested factors. */
export const probeUrl = (base: string, factors: readonly string[] = []): string =>
  `${base}/?universe=${UNIVERSE}&voz=0${factors.length > 0 ? `&${FACTOR_PARAM}=${factors.join(",")}` : ""}`;

/** The requests the page did not recognize (`applied` is the container attribute, null if absent). */
export const missingFactors = (requested: readonly string[], applied: string | null): string[] => {
  const got = new Set((applied ?? "").split(",").filter(Boolean));
  return requested.filter((f) => !got.has(f));
};

/** Command-line arguments; an invalid value is an error before launching anything. */
export function parseProbeArgs(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): ProbeArgs {
  const val = (k: string): string | undefined => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const gl = parseGlMode(val("gl") ?? env["LG_GL"]);
  const tierArg = val("tier") ?? "all";
  const tiers = tierArg === "all" ? [...TIERS] : tierArg.split(",").map((t) => {
    if (!(TIERS as readonly string[]).includes(t)) throw new Error(`tier desconocido "${t}" (low, medium, high o all)`);
    return t as Tier;
  });
  const poseArg = val("pose") ?? "all";
  const poses = poseArg === "all" ? [...POSES] : poseArg.split(",").map((p) => {
    if (!(POSES as readonly string[]).includes(p)) throw new Error(`pose desconocida "${p}" (${POSES.join(", ")} o all)`);
    return p as Pose;
  });
  const factors = [...new Set(argv.filter((x) => x.startsWith("--factor=")).flatMap((x) => x.slice("--factor=".length).split(",")).map((f) => f.trim()))];
  for (const f of factors) if (!FACTOR_NAME.test(f)) throw new Error(`factor mal escrito "${f}" (p. ej. grass-off, dpr-1.0)`);
  const build = argv.includes("--build");
  if (build && factors.length > 0) throw new Error("--factor no aplica a --build (en producción no hay factores de desarrollo)");
  const label = val("label") ?? (factors.length > 0 ? `factor-${factors.join("+")}` : "adhoc");
  return { gl, tiers, poses, label, build, failOnPurpose: argv.includes("--fail-on-purpose"), factors };
}

export interface FrameStats { frames: number; mean: number; p50: number; p95: number }

/** Mean, p50 and p95 of the times between frames (ms). With no frames, zeros. */
export function frameStats(times: readonly number[]): FrameStats {
  if (times.length === 0) return { frames: 0, mean: 0, p50: 0, p95: 0 };
  const s = [...times].sort((a, b) => a - b);
  const at = (q: number): number => s[Math.min(s.length - 1, Math.floor(q * s.length))] as number;
  const r = (x: number): number => Math.round(x * 100) / 100;
  return { frames: s.length, mean: r(s.reduce((a, b) => a + b, 0) / s.length), p50: r(at(0.5)), p95: r(at(0.95)) };
}

export interface GpuMem { textureMB: number; textures: number; renderbufferMB: number; bufferMB: number }

export interface Row {
  config: ConfigId;
  tier: Tier;
  pose: Pose;
  stats: FrameStats;
  calls: number;
  triangles: number;
  programs: number;
  mem: GpuMem;
  renderer: string;
  frameloop: string;
  regulators: number;
  /** Timestamps (ms epoch) of the warm-up and of the window. */
  warmupStart: number;
  windowStart: number;
  windowEnd: number;
  /** Window duration on the page clock and sum of the times between frames measured in it (ms). */
  pageWindowMs: number;
  frameSumMs: number;
}

/**
 * The warm-up lasted at least 12 s and the window at least 10 s on both clocks (the probe's and the page's).
 * No upper cap: in SwiftShader the render eats the CPU and Node timers stretch; the window is
 * read all the same when the page counts 10 s, and what lasts longer stays in the log.
 */
export const timingOk = (r: Pick<Row, "warmupStart" | "windowStart" | "windowEnd" | "pageWindowMs">): boolean =>
  r.windowStart - r.warmupStart >= WARMUP_MS && r.windowEnd - r.windowStart >= WINDOW_MS && r.pageWindowMs >= WINDOW_MS;

/**
 * Memory hook (port of the mockup V6's tools/mem.cjs): wraps WebGL2's allocation calls before the page
 * loads and sums what each live object requests, with the mip chain. Compressed formats count their block size
 * (compressedTexImage2D: the bytes uploaded; texStorage2D: bytes per pixel of the block). It is what the
 * page requests, not what a given driver spends.
 */
export const MEM_HOOK = `(() => {
  if (typeof WebGL2RenderingContext === "undefined") return;
  const P = WebGL2RenderingContext.prototype, GL = WebGL2RenderingContext;
  const live = { tex: new Map(), rb: new Map(), buf: new Map() };
  const bound = { tex: new Map(), rb: null, buf: new Map() };
  let unit = GL.TEXTURE0;
  const sized = { [GL.RGBA8]: 4, [GL.SRGB8_ALPHA8]: 4, [GL.RGB8]: 4, [GL.SRGB8]: 4, [GL.RGBA16F]: 8, [GL.RGB16F]: 8, [GL.RGBA32F]: 16, [GL.R8]: 1, [GL.RG8]: 2,
    [GL.R16F]: 2, [GL.RG16F]: 4, [GL.R32F]: 4, [GL.DEPTH_COMPONENT16]: 2, [GL.DEPTH_COMPONENT24]: 4, [GL.DEPTH_COMPONENT32F]: 4, [GL.DEPTH24_STENCIL8]: 4,
    [GL.DEPTH32F_STENCIL8]: 8, [GL.RGBA4]: 2, [GL.RGB565]: 2, [GL.RGB5_A1]: 2, [GL.STENCIL_INDEX8]: 1,
    0x83F0: 0.5, 0x83F1: 0.5, 0x8C4C: 0.5, 0x8C4D: 0.5, 0x83F2: 1, 0x83F3: 1, 0x8C4E: 1, 0x8C4F: 1, 0x8E8C: 1, 0x8E8D: 1,
    0x9274: 0.5, 0x9275: 0.5, 0x9278: 1, 0x9279: 1, 0x93B0: 1, 0x93D0: 1 };
  const unsized = (fmt, type) => {
    const ch = { [GL.RGBA]: 4, [GL.RGB]: 4, [GL.RG]: 2, [GL.RED]: 1, [GL.LUMINANCE]: 1, [GL.ALPHA]: 1, [GL.LUMINANCE_ALPHA]: 2, [GL.DEPTH_COMPONENT]: 1, [GL.DEPTH_STENCIL]: 1 }[fmt] || 4;
    const b = { [GL.UNSIGNED_BYTE]: 1, [GL.HALF_FLOAT]: 2, [GL.FLOAT]: 4, [GL.UNSIGNED_INT]: 4, [GL.UNSIGNED_SHORT]: 2, [GL.UNSIGNED_INT_24_8]: 4 }[type] || 1;
    return fmt === GL.DEPTH_STENCIL ? 4 : ch * b;
  };
  const cube = (t) => t >= GL.TEXTURE_CUBE_MAP_POSITIVE_X && t <= GL.TEXTURE_CUBE_MAP_NEGATIVE_Z;
  const curTex = (target) => bound.tex.get(unit + ":" + (cube(target) ? GL.TEXTURE_CUBE_MAP : target));
  const wrap = (name, f) => { const o = P[name]; if (!o) return; P[name] = function (...a) { f.call(this, ...a); return o.apply(this, a); }; };
  const level = (t, key, bytes, w, h) => {
    const e = live.tex.get(t) || { bytes: 0, levels: {}, w, h };
    if (!e.levels || typeof e.levels !== "object") e.levels = {};
    e.levels[key] = bytes;
    e.bytes = Object.values(e.levels).reduce((x, y) => x + y, 0); e.w = e.w || w; e.h = e.h || h;
    live.tex.set(t, e);
  };
  wrap("activeTexture", (u) => { unit = u; });
  wrap("bindTexture", (t, tex) => { bound.tex.set(unit + ":" + t, tex); });
  wrap("texStorage2D", (target, levels, fmt, w, h) => {
    const t = curTex(target); if (!t) return;
    let s = 0, ww = w, hh = h;
    for (let l = 0; l < levels; l++) { s += Math.max(ww * hh, 16) * (sized[fmt] || 4); ww = Math.max(1, ww >> 1); hh = Math.max(1, hh >> 1); }
    live.tex.set(t, { bytes: s * (target === GL.TEXTURE_CUBE_MAP ? 6 : 1), w, h, levels });
  });
  wrap("texImage2D", (target, lvl, ifmt, ...rest) => {
    const t = curTex(target); if (!t) return;
    let w, h, fmt, type;
    if (rest.length >= 6) { [w, h, , fmt, type] = rest; } else { [fmt, type] = rest; const src = rest[2]; w = src.width || src.videoWidth || 0; h = src.height || src.videoHeight || 0; }
    level(t, target + ":" + lvl, w * h * (sized[ifmt] || unsized(fmt, type)), w, h);
  });
  wrap("compressedTexImage2D", (target, lvl, _ifmt, w, h, _b, data) => {
    const t = curTex(target); if (!t) return;
    level(t, target + ":" + lvl, data && data.byteLength !== undefined ? data.byteLength : 0, w, h);
  });
  wrap("deleteTexture", (t) => live.tex.delete(t));
  wrap("bindRenderbuffer", (_t, rb) => { bound.rb = rb; });
  wrap("renderbufferStorage", (_t, fmt, w, h) => { if (bound.rb) live.rb.set(bound.rb, w * h * (sized[fmt] || 4)); });
  wrap("renderbufferStorageMultisample", (_t, samples, fmt, w, h) => { if (bound.rb) live.rb.set(bound.rb, w * h * (sized[fmt] || 4) * Math.max(1, samples)); });
  wrap("deleteRenderbuffer", (rb) => live.rb.delete(rb));
  wrap("bindBuffer", (t, b) => { bound.buf.set(t, b); });
  wrap("bufferData", (t, d) => { const b = bound.buf.get(t); if (b) live.buf.set(b, typeof d === "number" ? d : d.byteLength); });
  wrap("deleteBuffer", (b) => live.buf.delete(b));
  globalThis.__lgGpuMem = () => {
    const sum = (m) => [...m.values()].reduce((a, v) => a + (typeof v === "number" ? v : v.bytes), 0);
    const mb = (x) => Math.round((x / 1048576) * 10) / 10;
    return { textureMB: mb(sum(live.tex)), textures: live.tex.size, renderbufferMB: mb(sum(live.rb)), bufferMB: mb(sum(live.buf)) };
  };
})();`;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Sets the tier by hand (PerformanceMonitor does not lower it with a fixed tier) and waits for the map to be ready. */
async function setTier(page: Page, tier: Tier): Promise<void> {
  await page.evaluate(`import("/src/state/store.ts").then((m) => { globalThis.__lgProbeStore = m.gameStore; })`);
  await page.evaluate(`import("/src/state/actions.ts").then((m) => m.actions.setTierChoice(${JSON.stringify(tier)}))`);
  // Synchronous predicate: an import() promise is truthy and the wait passed without waiting (the same fix as waitGame).
  await page.waitForFunction(`(() => { const s = globalThis.__lgProbeStore.getState(); return s.settings.graphics.tier === ${JSON.stringify(tier)} && s.world.dioramaStatus === "ready"; })()`, undefined, { timeout: 60_000 });
}

interface Hook { frameloop: string; regulators: number }
const readHook = (page: Page): Promise<Hook | null> => page.evaluate(`(() => {
  const p = globalThis.__lgPerfProbe;
  return p ? { frameloop: p.frameloop(), regulators: p.regulators() } : null;
})()`);

/** A measurement window: warm-up, reset to zero and 10 s of frames. */
async function measure(page: Page, cfg: ConfigId, tier: Tier, pose: Pose, renderer: string, log: (s: string) => void): Promise<Row> {
  const warmupStart = Date.now();
  await sleep(WARMUP_MS);
  await page.evaluate("globalThis.__lgPerfProbe.resetFrames()");
  const windowStart = Date.now();
  await sleep(WINDOW_MS);
  await page.waitForFunction(`globalThis.__lgPerfProbe.sinceReset() >= ${WINDOW_MS}`, undefined, { timeout: WINDOW_MS * 6 });
  const raw = await page.evaluate(`(() => {
    const p = globalThis.__lgPerfProbe;
    return { pageWindowMs: p.sinceReset(), times: p.frameTimes(), counters: p.counters(), frameloop: p.frameloop(), regulators: p.regulators(),
      mem: globalThis.__lgGpuMem ? globalThis.__lgGpuMem() : { textureMB: 0, textures: 0, renderbufferMB: 0, bufferMB: 0 } };
  })()`) as { pageWindowMs: number; times: number[]; counters: { calls: number; triangles: number; programs: number }; frameloop: string; regulators: number; mem: GpuMem };
  const windowEnd = Date.now();
  const row: Row = {
    config: cfg, tier, pose, stats: frameStats(raw.times), calls: raw.counters.calls, triangles: raw.counters.triangles,
    programs: raw.counters.programs, mem: raw.mem, renderer, frameloop: raw.frameloop, regulators: raw.regulators, warmupStart, windowStart, windowEnd,
    pageWindowMs: Math.round(raw.pageWindowMs), frameSumMs: Math.round(raw.times.reduce((x, y) => x + y, 0)),
  };
  log(`[probe] ${cfg} ${tier} ${pose}: media ${row.stats.mean} ms, p50 ${row.stats.p50}, p95 ${row.stats.p95} (${row.stats.frames} cuadros), ` +
    `${row.calls} llamadas, ${row.triangles} triángulos, ${row.programs} programas, texturas ${row.mem.textureMB} MB, render buffers ${row.mem.renderbufferMB} MB; ` +
    `calentamiento ${windowStart - warmupStart} ms, ventana ${windowEnd - windowStart} ms (página ${row.pageWindowMs} ms, cuadros suman ${row.frameSumMs} ms)`);
  return row;
}

/** One column (viewport and DPR) in a fresh browser: enters the world, checks the uncapped mode, measures tier × pose. */
async function runConfig(exe: string, a: ProbeArgs, stack: Stack, cfg: (typeof CONFIGS)[number], log: (s: string) => void): Promise<Row[]> {
  return withGlBrowser(exe, { mode: a.gl, uncapped: true, viewport: cfg.viewport, deviceScaleFactor: cfg.dpr, failOnPurpose: a.failOnPurpose, initScript: MEM_HOOK, log },
    async (page, info: GlLaunch) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(probeUrl(stack.url, a.factors));
      await enterWorld(page);
      // T10 (d): the world's first frame arrives after compileAsync; before that the frameloop is on "never".
      await page.waitForFunction(`performance.getEntriesByName(${JSON.stringify(MARK_FIRST_FRAME)}).length > 0`, undefined, { timeout: 60_000 });
      const applied = await page.getAttribute("[data-lg-world]", FACTORS_ATTR);
      const missing = missingFactors(a.factors, applied);
      if (missing.length > 0) throw new Error(`la página no reconoció los factores ${missing.join(", ")} (aplicados: "${applied ?? ""}")`);
      if (a.factors.length > 0) log(`[probe] ${cfg.id}: factores ${applied}`);
      await page.evaluate(SAVE_SPAWN);
      await page.waitForFunction("globalThis.__lgPerfProbe !== undefined", undefined, { timeout: 30_000 });
      const hook = await readHook(page);
      if (!hook || hook.frameloop !== "always" || hook.regulators !== 0) {
        throw new Error(`modo sin tope roto: frameloop ${hook?.frameloop ?? "?"}, FrameRegulator montados ${hook?.regulators ?? "?"}`);
      }
      log(`[probe] ${cfg.id}: frameloop "${hook.frameloop}", FrameRegulator montados ${hook.regulators}`);
      const rows: Row[] = [];
      for (const tier of a.tiers) {
        await setTier(page, tier);
        for (const pose of a.poses.filter(poseAvailable)) {
          await (POSE_APPLY[pose] as (p: Page) => Promise<void>)(page);
          rows.push(await measure(page, cfg.id, tier, pose, info.renderer, log));
        }
      }
      if (errors.length > 0) throw new Error(`errores de página: ${errors.slice(0, 3).join(" | ")}`);
      return rows;
    });
}

export interface LoadSample { ms: number; programs: number | null; source: "marks" | "dom" }

/**
 * Load over the build (D-835): fresh profile per sample (a new browser each time). Measures from the click on
 * `#menu-world` to the world's first frame. Since T10 (d) the measurement comes from the marks `lg:world-enter` and
 * `lg:world-first-frame` (compileAsync before the first frame; `detail.programs`); without them, from the DOM (canvas + two rAF).
 */
async function loadSample(exe: string, a: ProbeArgs, url: string, log: (s: string) => void): Promise<LoadSample> {
  return withGlBrowser(exe, { mode: a.gl, uncapped: true, failOnPurpose: a.failOnPurpose, log }, async (page) => {
    await page.goto(probeUrl(url));
    await page.waitForSelector("#menu-world:not([aria-disabled='true'])", { timeout: 60_000 });
    const t0 = await page.evaluate("performance.now()") as number;
    await page.click("#menu-world");
    // Open-world-3d T9: the world canvas, not the minimap's (which is also a canvas and comes first in the DOM).
    await page.waitForFunction(`document.querySelector(${JSON.stringify(WORLD_CANVAS)}) !== null`, undefined, { timeout: 60_000 });
    // T10 (d): with the marks, the first-frame one is awaited (it carries programs.length in `detail`); without them, the DOM.
    await page.waitForFunction(`performance.getEntriesByName(${JSON.stringify(MARK_FIRST_FRAME)}).length > 0`, undefined, { timeout: 60_000 }).catch(() => {});
    const r = await page.evaluate(`new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const enter = performance.getEntriesByName(${JSON.stringify(MARK_ENTER)})[0], first = performance.getEntriesByName(${JSON.stringify(MARK_FIRST_FRAME)})[0];
      ok(enter && first ? { ms: first.startTime - enter.startTime, source: "marks", programs: first.detail?.programs ?? null } : { ms: performance.now() - ${t0}, source: "dom", programs: null });
    })))`) as { ms: number; source: "marks" | "dom"; programs: number | null };
    return { ms: Math.round(r.ms), programs: r.programs, source: r.source };
  });
}

const median = (xs: readonly number[]): number => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)] ?? 0;

/** Markdown table of a run (one row per tier and pose; DPR 1.5 and 1920x1080 as informational columns). */
export function markdownSection(
  a: Pick<ProbeArgs, "gl" | "label"> & { factors?: readonly string[] }, commit: string, rows: readonly Row[], skipped: readonly Pose[], load: readonly LoadSample[],
): string {
  const main = rows.filter((r) => r.config === "main");
  const other = (cfg: ConfigId, r: Row): Row | undefined => rows.find((x) => x.config === cfg && x.tier === r.tier && x.pose === r.pose);
  const renderer = rows[0]?.renderer ?? "(sin filas)";
  const lines = [
    `## ${a.label} · ${a.gl} · ${commit}`,
    "",
    `Renderer: ${renderer}. 1280x720 a DPR 1, sin tope (frameloop "always", sin FrameRegulator), calentamiento ${WARMUP_MS / 1000} s y ventana ${WINDOW_MS / 1000} s por tier y pose. ` +
      "Tiempos en ms entre cuadros; llamadas y triángulos del último cuadro completo; memoria = lo que la página pide a WebGL (texturas sin los render buffers).",
    "",
    "| tier | pose | media | p50 | p95 | cuadros | llamadas | triángulos | programas | texturas MB | render buffers MB | media DPR 1.5 | p95 DPR 1.5 | media 1920x1080 |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...main.map((r) => {
      const d = other("dpr1.5", r);
      const f = other("1920x1080", r);
      return `| ${r.tier} | ${r.pose} | ${r.stats.mean} | ${r.stats.p50} | ${r.stats.p95} | ${r.stats.frames} | ${r.calls} | ${r.triangles} | ${r.programs} | ${r.mem.textureMB} | ${r.mem.renderbufferMB} | ${d?.stats.mean ?? "n/d"} | ${d?.stats.p95 ?? "n/d"} | ${f?.stats.mean ?? "n/d"} |`;
    }),
  ];
  // A `--build` run does not measure frames: only the load line.
  if (main.length === 0) lines.splice(1);
  if (main.length > 0 && skipped.length > 0) lines.push("", `Poses todavía no disponibles: ${skipped.join(", ")}.`);
  if (main.length > 0 && a.factors && a.factors.length > 0) lines.push("", `Factores de desarrollo (T10 (b)): ${a.factors.join(", ")}.`);
  if (load.length > 0) {
    const programs = load.map((l) => l.programs).filter((p): p is number => p !== null);
    lines.push("", `Carga sobre el build (vite build + vite preview, perfil nuevo por muestra): ${load.map((l) => `${l.ms} ms (${l.source})`).join(", ")}; mediana ${median(load.map((l) => l.ms))} ms.` +
      (programs.length > 0 ? ` Programas después del primer cuadro: ${programs.join(", ")}.` : "") +
      (load.some((l) => l.source === "dom") ? " Medida provisoria por DOM (clic a canvas + dos cuadros): faltó una de las marcas lg:world-enter o lg:world-first-frame (T10 (d))." : ""));
  }
  return `${lines.join("\n")}\n`;
}

/** Replaces (or adds) the section for the label and the GL in the report. */
export function upsertSection(doc: string, label: string, gl: GlMode, section: string): string {
  const head = "# learning-game open-world-3d: sonda de rendimiento (perf:probe)\n\nUna sección por corrida (`--label`) y GPU. Generado por scripts/dev/perf-probe.ts.\n\n";
  const body = doc.startsWith("# ") ? doc.slice(doc.indexOf("\n## ") >= 0 ? doc.indexOf("\n## ") + 1 : doc.length) : doc;
  const parts = body.split(/(?=^## )/m).filter((p) => p.trim() !== "");
  const key = `## ${label} · ${gl} · `;
  const kept = parts.filter((p) => !p.startsWith(key));
  return `${head}${[...kept, section].map((p) => p.trimEnd()).join("\n\n")}\n`;
}

const commitLabel = (): string => {
  const sha = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).stdout.trim();
  const dirty = spawnSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: REPO_ROOT, encoding: "utf8" }).stdout.trim() !== "";
  return `${sha}${dirty ? " + cambios sin commit" : ""}`;
};

/** `vite build` of apps/web into a temporary folder (for `--build`). */
function buildWeb(outDir: string): void {
  const vite = join(REPO_ROOT, "node_modules/vite/bin/vite.js");
  const r = spawnSync(process.execPath, [vite, "build", "--outDir", outDir, "--emptyOutDir", "--logLevel", "error"], { cwd: join(REPO_ROOT, "apps/web"), stdio: "inherit" });
  if (r.status !== 0) throw new Error("vite build falló");
}

async function main(): Promise<void> {
  const log = (s: string): void => console.log(s);
  let a: ProbeArgs;
  try {
    a = parseProbeArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`[probe] ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 2;
    return;
  }
  const exe = findChromium();
  if (!exe) {
    console.error("[probe] no hay Chromium en la cache de Playwright (ms-playwright); este script no instala nada.");
    process.exitCode = 2;
    return;
  }
  let stack: Stack | null = null;
  let tmp: string | null = null;
  const stopAll = (): void => { stack?.stop(); stack = null; };
  const onSignal = (): void => { void closeAllGlBrowsers().finally(() => { stopAll(); process.exit(130); }); };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    const skipped = a.poses.filter((p) => !poseAvailable(p));
    let rows: Row[] = [];
    const load: LoadSample[] = [];
    if (a.build) {
      tmp = mkdtempSync(join(tmpdir(), "lg-probe-build-"));
      buildWeb(tmp);
      stack = await startStack(UNIVERSE, {}, { previewDir: tmp });
      for (let i = 0; i < LOAD_SAMPLES; i++) {
        const s = await loadSample(exe, a, stack.url, log);
        log(`[probe] carga ${i + 1}/${LOAD_SAMPLES}: ${s.ms} ms (${s.source})`);
        load.push(s);
      }
    } else {
      stack = await startStack(UNIVERSE, { VITE_LG_PERF_PROBE: "1" });
      for (const cfg of CONFIGS) rows = [...rows, ...(await runConfig(exe, a, stack, cfg, log))];
      const bad = rows.filter((r) => !timingOk(r));
      if (bad.length > 0) throw new Error(`calentamiento o ventana fuera de lo pedido en ${bad.length} fila(s)`);
    }
    const commit = commitLabel();
    mkdirSync(REPORT_JSON_DIR, { recursive: true });
    const json = join(REPORT_JSON_DIR, `${a.label}-${a.gl}${a.build ? "-build" : ""}.json`);
    writeFileSync(json, `${JSON.stringify({ label: a.label, gl: a.gl, commit, warmupMs: WARMUP_MS, windowMs: WINDOW_MS, rows, skipped, load, factors: a.factors }, null, 2)}\n`);
    const prev = existsSync(REPORT_MD) ? readFileSync(REPORT_MD, "utf8") : "";
    writeFileSync(REPORT_MD, upsertSection(prev, a.build ? `${a.label} (build)` : a.label, a.gl, markdownSection({ gl: a.gl, label: a.build ? `${a.label} (build)` : a.label, factors: a.factors }, commit, rows, skipped, load)));
    const above30 = rows.some((r) => r.config === "main" && r.stats.frames > 0 && r.stats.mean < 1000 / 30);
    log(`[probe] ${rows.length} fila(s); una muestra arriba de 30 FPS: ${above30}; JSON ${json}; informe ${REPORT_MD}`);
    process.exitCode = 0;
  } catch (e) {
    console.error(`[probe] ERROR ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  } finally {
    stopAll();
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
