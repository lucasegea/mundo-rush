// `npm run walk:browser` (M6.4 T8, D-815): narrow exception to D-016/C11, RATIFIED 2026-10-27 (on condition: the
// browser is always closed at the end). A single script, on demand, OUTSIDE `npm run verify`: it starts its own server and Vite
// (LG_OPERATOR_MODE=1, LG_FAKE_MODELS=1, free ports on 127.0.0.1, in-memory stores), opens the already-installed Chromium
// (playwright-core, nothing downloaded) and walks the game saving screenshots. A red walk is a report,
// not a broken build.
//
// Hard rules of this file:
//   - The browser is ALWAYS closed at the end: try/finally closing context and browser on success, on failure and on a thrown
//     error (and on SIGINT/SIGTERM). `--fail-on-purpose` (or LG_WALK_FAIL=1) throws an error on purpose after opening
//     the browser so QA can check that no chromium is left alive.
//   - Only the PIDs this script started are killed (never by process name).
//   - "Walking" uses the same store actions as click and keyboard (moveTo / interact) with the real game running;
//     the store is reached by importing Vite's own modules (same instance as the app).
//   - open-world-3d T2(f) (D-833, AC12): GL comes from `LG_GL=gpu|igpu|swiftshader` (default `gpu`, the NVIDIA) through the
//     shared launcher scripts/dev/gl-mode.ts, which checks the unmasked renderer and fails if it is not the mode's; an unknown
//     mode exits with 2 before opening anything. The viewport is 1280x720 (the probe's and the mockup's).
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer, connect } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright-core";
import { DEFAULT_LOOK } from "@lg/art";
import {
  AC41, AC51, AC52, crownSolidity, diffMask, grassDefects, maskPixels, pairwiseDistinct, skyCheck, yellowShare, type ProjectedTree, type Rgba,
} from "./defects/classify.ts";
import { closeAllGlBrowsers, parseGlMode, withGlBrowser, type GlMode } from "./gl-mode.ts";
import { angleDelta, beaconsOk, forwardOf, forwardWalkOk, onScreen, projectWithMatrices, rightOf, turnFollowsYaw, type BeaconSeen, type P2 } from "./third-person-walk.ts";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const SHOTS_DIR = join(REPO_ROOT, "(internal document)");
export const UNIVERSE = "U-GALEANO";

/**
 * Pixel-analysis thresholds (AC12/AC17): distinct quantized colors and a cap on a single color. Readjusted ONCE
 * on the GPU render (open-world-3d T3, S-OW-18; before, 12 and 0.6, from the tile render in SwiftShader): the
 * dock in diorama format measured on LG_GL=gpu gave 126 colors and 60.9 % dominant grass, and the farmer map 141 and 35 %.
 * Red test (same quantization): a grass-only crop of that capture gives 6 colors and 96.5 %, and a flat color 1 and
 * 100 %; both fail.
 */
export const MIN_DISTINCT_COLORS = 40;
export const MAX_DOMINANT_SHARE = 0.75;

export interface PixelStats { distinct: number; dominantShare: number }

/** AC12/AC17 (AC16 of open-world-3d): the rendered map is not uniform. Pure, so it can be tested without a browser. */
export const isNonUniform = (s: PixelStats): boolean => s.distinct >= MIN_DISTINCT_COLORS && s.dominantShare <= MAX_DOMINANT_SHARE;

/** Chromium folder: LG_CHROMIUM wins; otherwise the newest `chromium-*` in the Playwright cache. Never installs. */
export function findChromium(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string | null {
  const explicit = env["LG_CHROMIUM"];
  if (explicit) return existsSync(explicit) ? explicit : null;
  const cache = env["PLAYWRIGHT_BROWSERS_PATH"]
    ?? (platform === "win32" ? join(env["LOCALAPPDATA"] ?? "", "ms-playwright")
      : platform === "darwin" ? join(env["HOME"] ?? "", "Library/Caches/ms-playwright") : join(env["HOME"] ?? "", ".cache/ms-playwright"));
  if (!existsSync(cache)) return null;
  const rel = platform === "win32" ? "chrome-win64/chrome.exe" : platform === "darwin" ? "chrome-mac/Chromium.app/Contents/MacOS/Chromium" : "chrome-linux/chrome";
  const builds = readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
  for (const b of builds) {
    const exe = join(cache, b, rel);
    if (existsSync(exe)) return exe;
  }
  return null;
}

// ---------- own processes ----------

const freePort = (): Promise<number> => new Promise((ok, fail) => {
  const srv = createServer();
  srv.once("error", fail);
  srv.listen(0, "127.0.0.1", () => {
    const addr = srv.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    srv.close(() => ok(port));
  });
});

const portOpen = (port: number): Promise<boolean> => new Promise((ok) => {
  const s = connect({ port, host: "127.0.0.1" });
  s.once("connect", () => { s.destroy(); ok(true); });
  s.once("error", () => ok(false));
});

async function waitFor(what: string, test: () => Promise<boolean>, ms = 60_000): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await test()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timeout esperando ${what} (${ms} ms)`);
}

/** Kills ONLY the tree of this PID (on Windows the node child may have grandchildren). */
export function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill();
}

export interface Stack { url: string; stop: () => void }

/**
 * Scene server + Vite, with operator mode and scripted models, on free ports. `extraEnv` reaches the server and
 * Vite (the performance probe sets VITE_LG_PERF_PROBE=1 there). With `previewDir` it serves that build with `vite preview` (which
 * inherits the /scene proxy) instead of the dev server (the load of `perf:probe --build`).
 */
export async function startStack(universe: string | null, extraEnv: NodeJS.ProcessEnv = {}, opts: { previewDir?: string } = {}): Promise<Stack> {
  const build = spawnSync(process.execPath, [join(REPO_ROOT, "scripts/content/build.ts"), ...(universe ? [`--universe=${universe}`] : [])], { cwd: REPO_ROOT, stdio: "inherit" });
  if (build.status !== 0) throw new Error(`el contenido ${universe ?? "campesino"} no compilo`);
  const [serverPort, webPort] = [await freePort(), await freePort()];
  const env: NodeJS.ProcessEnv = {
    ...process.env, ...extraEnv, LG_OPERATOR_MODE: "1", LG_FAKE_MODELS: "1", LG_PORT: String(serverPort),
    ...(universe ? { LG_UNIVERSE: universe } : {}),
  };
  if (!universe) delete env["LG_UNIVERSE"];
  const webDir = join(REPO_ROOT, "apps/web");
  const viteBin = join(dirname(createRequire(join(webDir, "package.json")).resolve("vite/package.json")), "bin/vite.js");
  const children: ChildProcess[] = [
    spawn(process.execPath, [join(REPO_ROOT, "apps/server/src/main.ts")], { cwd: REPO_ROOT, env, stdio: "inherit" }),
    spawn(process.execPath, [viteBin, ...(opts.previewDir ? ["preview", "--outDir", opts.previewDir] : []), "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], { cwd: webDir, env, stdio: "inherit" }),
  ];
  const stop = (): void => { for (const c of children) killTree(c); };
  try {
    await waitFor("el servidor de escenas", () => portOpen(serverPort));
    await waitFor("Vite", () => portOpen(webPort));
  } catch (e) {
    stop();
    throw e;
  }
  return { url: `http://127.0.0.1:${webPort}`, stop };
}

// ---------- browser ----------

/**
 * The 3D world canvas (the `data-lg-world` surface of GameCanvas). Recorded change (open-world-3d T9): since the
 * minimap there is a second canvas (2D, in the shell, which comes first in the DOM), so "the first canvas" is no longer the world.
 */
export const WORLD_CANVAS = "[data-lg-world] canvas";

const checks: { ac: string; ok: boolean; detail: string }[] = [];
const check = (ac: string, ok: boolean, detail: string): void => {
  checks.push({ ac, ok, detail });
  console.log(`[walk] ${ok ? "OK  " : "FALLA"} ${ac} ${detail}`);
};

const shot = async (page: Page, name: string): Promise<string> => {
  const file = join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`[walk] captura ${file}`);
  return file;
};

/** Quantizes the map canvas (3 bits per channel) and measures distinct colors and the dominant color. */
async function canvasStats(page: Page): Promise<PixelStats> {
  const png = await page.locator(WORLD_CANVAS).screenshot();
  const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
  return page.evaluate<PixelStats>(`(async () => {
    const img = new Image();
    img.src = ${JSON.stringify(dataUrl)};
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const bins = new Map();
    for (let i = 0; i < d.length; i += 4) {
      const k = ((d[i] >> 5) << 6) | ((d[i + 1] >> 5) << 3) | (d[i + 2] >> 5);
      bins.set(k, (bins.get(k) || 0) + 1);
    }
    return { distinct: bins.size, dominantShare: Math.max(...bins.values()) / (d.length / 4) };
  })()`);
}

/** The capture of an element as RGBA (rows top to bottom), in CSS pixels of its rectangle. */
async function elementImage(page: Page, selector: string): Promise<Rgba> {
  const png = await page.locator(selector).screenshot();
  const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
  const r = await page.evaluate<{ w: number; h: number; b64: string }>(`(async () => {
    const img = new Image();
    img.src = ${JSON.stringify(dataUrl)};
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let s = "";
    for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
    return { w: c.width, h: c.height, b64: btoa(s) };
  })()`);
  return { width: r.w, height: r.h, data: new Uint8Array(Buffer.from(r.b64, "base64")) };
}

/** The capture of the world canvas as RGBA. */
const canvasImage = (page: Page): Promise<Rgba> => elementImage(page, WORLD_CANVAS);

const WORLD_READY = `document.querySelector(${JSON.stringify(WORLD_CANVAS)}) !== null`;

/** The mark of the world's first frame (@lg/core LOAD_MARKS.worldFirstFrame; browser-walk.test.ts pins that they are equal). */
export const WORLD_FIRST_FRAME_MARK = "lg:world-first-frame";

/** Menu: waits for `#menu-world` enabled and enters the map. */
export async function enterWorld(page: Page): Promise<void> {
  await page.waitForSelector("#menu-world:not([aria-disabled='true'])", { timeout: 30_000 });
  await page.click("#menu-world");
  await page.waitForFunction(WORLD_READY, undefined, { timeout: 30_000 });
  // waitGame: a predicate that returns the import() promise is truthy and waited for nothing.
  await waitGame(page, `s.world.dioramaStatus === "ready"`, 30_000);
  // T10: the first frame waits for compileAsync; its mark is awaited (like the probe) and then a few more frames.
  await page.waitForFunction(`performance.getEntriesByName(${JSON.stringify(WORLD_FIRST_FRAME_MARK)}).length > 0`, undefined, { timeout: 60_000 });
  await page.waitForTimeout(1500); // a few frames so the render draws
}

/** Walks toward the NPC (the action the click on it triggers) and waits for the notice "talk to <name>". */
async function walkToNpc(page: Page, npcId: string): Promise<string> {
  const t0 = Date.now();
  const name = await page.evaluate<string>(`(async () => {
    const { gameStore } = await import("/src/state/store.ts");
    const { actions } = await import("/src/state/actions.ts");
    const info = gameStore.getState().world.npcs.find((n) => n.id === ${JSON.stringify(npcId)});
    actions.interact(${JSON.stringify(npcId)});
    return info ? info.name : ${JSON.stringify(npcId)};
  })()`);
  // The notice may keep naming the previous NPC until arrival: wait for the right name.
  await page.waitForFunction(`(document.querySelector("#world-talk")?.textContent || "").includes(${JSON.stringify(name)})`, undefined, { timeout: 90_000 })
    .catch(async () => { throw new Error(`el aviso de ${npcId} dice "${(await page.textContent("#world-talk").catch(() => null)) ?? "(sin boton)"}" y se esperaba "${name}"`); });
  await recordVisit(page, npcId, Date.now() - t0); // AC52 (T8): only while the run from the spawn is going
  return name;
}

/** Waits until it can type, or until the scene has ended. Returns true if it can still type. */
async function nextHand(page: Page): Promise<boolean> {
  await page.waitForFunction(`(() => {
    const input = document.querySelector("#scene-input");
    const writable = input !== null && input.getAttribute("aria-disabled") !== "true";
    return writable || document.querySelector("#scene-back") !== null;
  })()`, undefined, { timeout: 30_000 });
  return (await page.$("#scene-back")) === null;
}

/** Plays the text turns; stops when the scene ends. */
async function playTurns(page: Page, turns: readonly string[]): Promise<void> {
  for (const text of turns) {
    if (!(await nextHand(page))) return;
    await page.fill("#scene-input", text);
    await page.click("#scene-done");
  }
  await nextHand(page);
}

async function talkTo(page: Page, npcId: string): Promise<string> {
  const name = await walkToNpc(page, npcId);
  await page.click("#world-talk");
  await page.waitForSelector("[data-testid='dialogue-hud']", { timeout: 15_000 });
  return name;
}

async function leaveScene(page: Page): Promise<void> {
  await page.click(((await page.$("#scene-back")) ? "#scene-back" : "#scene-leave"));
  await page.waitForSelector("[data-testid='dialogue-hud']", { state: "detached", timeout: 15_000 });
}

const hudText = async (page: Page): Promise<string> => (await page.textContent("[data-testid='dialogue-hud']")) ?? "";

// ---------- third person (open-world-3d M2: AC28, AC29, AC30) ----------

interface CamState { pos: P2; yaw: number; t: number; dist: number; overview: boolean; preset: string; rigYaw: number; rigT: number; rigDist: number }

/** Player and camera: what was requested (store) and what was drawn (CameraRig leaves the smoothed yaw, t and distance in cameraLook). */
const camState = (page: Page): Promise<CamState> => page.evaluate<CamState>(`(async () => {
  const { gameStore } = await import("/src/state/store.ts");
  const sel = await import("/src/state/selectors/index.ts");
  const { cameraLook } = await import("/src/world/runtime.ts");
  const s = gameStore.getState();
  const v = sel.selectCameraView(s);
  return {
    pos: { ...s.player.position }, yaw: v.yawDeg, t: v.t, dist: v.overview ? v.fitDistance : Math.min(v.zoomDistance, v.fitDistance),
    overview: v.overview, preset: sel.selectWorldRender(s).preset, rigYaw: cameraLook.yawDeg, rigT: cameraLook.t, rigDist: cameraLook.distance,
  };
})()`);

/** Matrices of the drawn camera and the canvas rectangle, to project world points. */
const cameraMatrices = (page: Page): Promise<{ view: number[]; proj: number[]; rect: { x: number; y: number; w: number; h: number } }> => page.evaluate(`(async () => {
  const { cameraLook } = await import("/src/world/runtime.ts");
  const c = cameraLook.camera;
  const r = document.querySelector(${JSON.stringify(WORLD_CANVAS)}).getBoundingClientRect();
  return { view: Array.from(c.matrixWorldInverse.elements), proj: Array.from(c.projectionMatrix.elements), rect: { x: r.left, y: r.top, w: r.width, h: r.height } };
})()`);

/**
 * A ground point to page pixels (null if off screen). Recorded change (open-world-3d T6): the
 * ground is no longer at y = 0; the height comes from `worldGround.heightAt` (the same `heightAt` as the drawn terrain).
 */
async function groundToScreen(page: Page, p: P2): Promise<{ x: number; y: number } | null> {
  const m = await cameraMatrices(page);
  const y = await page.evaluate<number>(`import("/src/world/runtime.ts").then(({ worldGround }) => worldGround.heightAt(${p.x}, ${p.z}))`);
  const ndc = projectWithMatrices(m.view, m.proj, [p.x, y, p.z]);
  if (!onScreen(ndc)) return null;
  return { x: m.rect.x + ((ndc[0] + 1) / 2) * m.rect.w, y: m.rect.y + ((1 - ndc[1]) / 2) * m.rect.h };
}

/** Drag with the main button around the canvas center, only to rotate the camera (AC28 uses dragOverGround). */
async function drag(page: Page, dx: number, dy = 0): Promise<void> {
  // Long drags in 400 px stretches, so as not to leave the 1280 px viewport.
  const parts = Math.max(1, Math.ceil(Math.abs(dx) / 400));
  for (let i = 0; i < parts; i++) {
    const x = 640 - dx / parts / 2;
    const y = 330;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / parts, y + dy / parts, { steps: 8 });
    await page.mouse.up();
  }
}

/** Player intent in the store: the type, the points left and the speed. */
const intentNow = (page: Page): Promise<{ kind: string; left: P2[]; v: P2 }> => page.evaluate(`import("/src/state/store.ts").then((m) => {
  const p = m.gameStore.getState().player;
  return { kind: p.intent.kind, left: p.intent.kind === "path" ? p.intent.waypoints.map((w) => ({ x: w.x, z: w.z })) : [], v: { x: p.velocity.x, z: p.velocity.z } };
})`);

/**
 * AC28 (c): a drag of `dx` px that starts and is released over pixels projected from ground points ~3 m
 * in front of the player (same depth, left and right), so the ground raycast receives the release and it is the
 * drag discard (isDragClick) that prevents the walk. Then it proves the release pixel lands on the ground:
 * a 2 px click there produces moveTo (a path), which is cancelled right away. null if there is no ground on screen.
 */
async function dragOverGround(page: Page, dx: number): Promise<{ moved: number; yawChange: number; intentAfterDrag: string; proofClick: string } | null> {
  const before = await camState(page);
  const f = forwardOf(before.yaw);
  const r = rightOf(before.yaw);
  const ahead = { x: before.pos.x + f.x * 3, z: before.pos.z + f.z * 3 };
  const side = (m: number): P2 => ({ x: ahead.x + r.x * m, z: ahead.z + r.z * m });
  const c = await groundToScreen(page, ahead);
  const c1 = await groundToScreen(page, side(1));
  if (!c || !c1) return null;
  const halfM = dx / 2 / Math.max(1, Math.hypot(c1.x - c.x, c1.y - c.y)); // meters sideways for dx/2 px
  const from = await groundToScreen(page, side(-halfM));
  const to = await groundToScreen(page, side(halfM));
  if (!from || !to) return null;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = await camState(page);
  const intentAfterDrag = (await intentNow(page)).kind;
  // Ground test: the same release pixel, as a 2 px click, walks (moveTo); it is cancelled and stillness is awaited.
  await page.mouse.move(to.x, to.y);
  await page.mouse.down();
  await page.mouse.move(to.x + 2, to.y);
  await page.mouse.up();
  const proofClick = await page.evaluate<string>(`(async () => {
    const { gameStore } = await import("/src/state/store.ts");
    const { actions } = await import("/src/state/actions.ts");
    const kind = gameStore.getState().player.intent.kind;
    actions.dispatch({ type: "cancel" });
    return kind;
  })()`);
  await settle(page, 200);
  return { moved: Math.hypot(after.pos.x - before.pos.x, after.pos.z - before.pos.z), yawChange: angleDelta(before.yaw, after.yaw), intentAfterDrag, proofClick };
}

const hold = async (page: Page, code: string, ms: number): Promise<void> => {
  await page.keyboard.down(code);
  await page.waitForTimeout(ms);
  await page.keyboard.up(code);
};

/**
 * Waits for a condition on the game state. The `waitForFunction` predicate has to be synchronous: a promise
 * (`import(...).then(...)`) is a truthy value and the wait would pass immediately. That is why the store is first left in
 * `window.__lgWalkStore` and `cond` is an expression over `s` (the current state).
 */
async function waitGame(page: Page, cond: string, timeout: number): Promise<void> {
  await page.evaluate(`import("/src/state/store.ts").then((m) => { window.__lgWalkStore = m.gameStore; })`);
  await page.waitForFunction(`(() => { const s = window.__lgWalkStore.getState(); return Boolean(${cond}); })()`, undefined, { timeout });
}

/** Waits for the player to stand still (store speed at zero). */
const settle = (page: Page, ms = 600): Promise<void> =>
  waitGame(page, "Math.hypot(s.player.velocity.x, s.player.velocity.z) < 1e-3", 10_000).then(() => page.waitForTimeout(ms));

/** The canvas row (from the top) where the horizon falls: a point 5 km ahead, at camera height. */
const horizonRow = (page: Page): Promise<number> => page.evaluate<number>(`import("/src/world/runtime.ts").then(({ cameraLook }) => {
  const c = cameraLook.camera;
  const pos = c.getWorldPosition(c.position.clone());
  const dir = c.getWorldDirection(c.position.clone());
  dir.y = 0;
  dir.normalize();
  const p = pos.clone().addScaledVector(dir, 5000).project(c);
  const r = document.querySelector(${JSON.stringify(WORLD_CANVAS)}).getBoundingClientRect();
  return ((1 - p.y) / 2) * r.height;
})`);

/** The first canvas row not covered by the HUD in the center column (the title bar sits on top). */
const worldTop = (page: Page): Promise<number> => page.evaluate<number>(`(() => {
  const c = document.querySelector(${JSON.stringify(WORLD_CANVAS)});
  const r = c.getBoundingClientRect();
  const x = r.left + r.width / 2;
  for (let y = 0; y < r.height; y++) if (document.elementFromPoint(x, r.top + y + 0.5) === c) return y;
  return 0;
})()`);

/** The canvas pixels that no HUD element covers (elementFromPoint is the canvas), every 2 px. */
async function worldVisible(page: Page, w: number, h: number): Promise<Uint8Array> {
  const b64 = await page.evaluate<string>(`(() => {
    const c = document.querySelector(${JSON.stringify(WORLD_CANVAS)});
    const r = c.getBoundingClientRect();
    const w = ${w}, h = ${h}, m = new Uint8Array(w * h);
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
      if (document.elementFromPoint(r.left + (x + 1) * r.width / w, r.top + (y + 1) * r.height / h) !== c) continue;
      for (let dy = 0; dy < 2 && y + dy < h; dy++) for (let dx = 0; dx < 2 && x + dx < w; dx++) m[(y + dy) * w + x + dx] = 1;
    }
    let s = "";
    for (let i = 0; i < m.length; i += 0x8000) s += String.fromCharCode.apply(null, m.subarray(i, i + 0x8000));
    return btoa(s);
  })()`);
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/** Shows the terrain (every object named "terreno" in the drawn scene) or hides it. */
const setTerrainVisible = (page: Page, on: boolean): Promise<number> => page.evaluate<number>(`import("/src/world/runtime.ts").then(({ cameraLook }) => {
  let root = cameraLook.camera;
  while (root && root.parent) root = root.parent;
  let n = 0;
  if (root) root.traverse((o) => { if (o.name === "terreno") { o.visible = ${on}; n++; } });
  return n;
})`);

/**
 * The sky mask of capture `img` (open-world-3d M3, AC39): the same frame is drawn with only the sky (everything
 * else hidden, except the "cielo" group) and the sky is what did not change (diffMask at 0), like the double capture of AC41.
 */
async function skyMask(page: Page, img: Rgba): Promise<Uint8Array> {
  const toggle = (only: boolean): Promise<number> => page.evaluate<number>(`import("/src/world/runtime.ts").then(({ cameraLook }) => {
    let root = cameraLook.camera;
    while (root && root.parent) root = root.parent;
    const hidden = (globalThis.__lgSkyHidden ??= []);
    if (!${only}) { for (const o of hidden) o.visible = true; hidden.length = 0; return 0; }
    const inSky = (o) => { for (let p = o; p; p = p.parent) if (p.name === "cielo") return true; return false; };
    root.traverse((o) => { if ((o.isMesh || o.isSprite || o.isPoints || o.isLine) && o.visible && !inSky(o)) { o.visible = false; hidden.push(o); } });
    return hidden.length;
  })`);
  const n = await toggle(true);
  if (n === 0) throw new Error("skyMask: no se escondió nada");
  await page.waitForTimeout(500);
  const bare = await canvasImage(page);
  await toggle(false);
  await page.waitForTimeout(500);
  return diffMask(img, bare).map((v) => 1 - v);
}

/**
 * Open-world-3d T7b (LK6): the id of the mounted diorama's look. AC39 and AC41 are DEFAULT_LOOK rules (not the engine's):
 * they run only if the dock is drawn with DEFAULT_LOOK, and otherwise they fail saying which look it was drawn with.
 */
const activeLookId = (page: Page): Promise<string | null> =>
  page.evaluate<string | null>(`import("/src/world/runtime.ts").then(({ activeLook }) => activeLook.id)`);

/** The two captures of the same frame, with and without terrain (like those of tools/defects.cjs), and the terrain mask. */

async function withAndWithoutTerrain(page: Page): Promise<{ img: Rgba; mask: Uint8Array }> {
  const img = await canvasImage(page);
  await setTerrainVisible(page, false);
  await page.waitForTimeout(500);
  const bare = await canvasImage(page);
  await setTerrainVisible(page, true);
  await page.waitForTimeout(500);
  return { img, mask: diffMask(img, bare) };
}

/**
 * AC41 (open-world-3d T6): on medium with reduced motion, the whole map (t = 1) and the t = 0.55 view, each twice
 * (with and without terrain). (1) Yellow among the terrain pixels at t = 1 at most 0.35. (2) At t = 0.55, the
 * yellow of the ring just outside the edge of the grass bed (medium's grass radius) minus that of the ring just
 * inside, at most 0.15. Leaves tier, reduced motion and zoom as they were.
 */
async function walkGround(page: Page): Promise<void> {
  const before = await page.evaluate<{ tier: string; reduce: boolean }>(`import("/src/state/store.ts").then((m) => {
    const s = m.gameStore.getState();
    return { tier: s.settings.graphics.tier, reduce: s.settings.accessibility.reduceMotion };
  })`);
  const t0 = (await camState(page)).t;
  const act = (code: string): Promise<void> => page.evaluate(`import("/src/state/actions.ts").then(({ actions }) => { ${code}; })`);
  await act(`actions.setTierChoice("medium"); actions.setReduceMotion(true)`);
  await waitGame(page, `s.world.dioramaStatus === "ready"`, 30_000);
  await act("actions.zoomTo(1)");
  await page.waitForTimeout(4000); // the medium scene, its maps and the smoothed zoom
  const full = await withAndWithoutTerrain(page);
  await shot(page, "ac41-mapa-completo");
  const y1 = yellowShare(full.img, maskPixels(full.mask));
  const terrainPx = full.mask.reduce((n, v) => n + v, 0);

  await act("actions.zoomTo(0.55)");
  await page.waitForTimeout(2500);
  const mid = await withAndWithoutTerrain(page);
  await shot(page, "ac41-t055");
  // Recorded change (open-world-3d T8, AC41 re-seal): before, the rings went around the player with medium's radius (24 m) and
  // the bed off (`uGrassBed.w` = 0, step ~0). With T8's grass the bed is the drawn one: its center goes
  // in front of the player and its radius shrinks with zoom (at t = 0.55, about 13 m), so the rings go around
  // THAT disc (runtime `grassBedView`, the ground's `grassBed`). Thresholds unchanged.
  const bed = await page.evaluate<{ x: number; z: number; radius: number; on: number }>(`import("/src/world/runtime.ts").then(({ grassBedView }) => ({ ...grassBedView }))`);
  const R = bed.radius;
  const ring = (lo: number, hi: number): P2[] => {
    const pts: P2[] = [];
    for (let a = 0; a < 360; a += 1) {
      for (let k = 0; k < 5; k++) {
        const r = R * (lo + ((hi - lo) * k) / 4);
        pts.push({ x: bed.x + r * Math.cos((a * Math.PI) / 180), z: bed.z + r * Math.sin((a * Math.PI) / 180) });
      }
    }
    return pts;
  };
  const m = await cameraMatrices(page);
  const pixelsOf = async (pts: P2[]): Promise<number[]> => {
    const ys = await page.evaluate<number[]>(`import("/src/world/runtime.ts").then(({ worldGround }) => ${JSON.stringify(pts)}.map((p) => worldGround.heightAt(p.x, p.z)))`);
    const out = new Set<number>();
    pts.forEach((p, i) => {
      const ndc = projectWithMatrices(m.view, m.proj, [p.x, ys[i] ?? 0, p.z]);
      if (!onScreen(ndc)) return;
      const x = Math.floor(((ndc[0] + 1) / 2) * mid.img.width);
      const y = Math.floor(((1 - ndc[1]) / 2) * mid.img.height);
      const idx = y * mid.img.width + x;
      if (x >= 0 && y >= 0 && x < mid.img.width && y < mid.img.height && mid.mask[idx]) out.add(idx);
    });
    return [...out];
  };
  const inner = yellowShare(mid.img, await pixelsOf(ring(AC41.inner[0], AC41.inner[1])));
  const outer = yellowShare(mid.img, await pixelsOf(ring(AC41.outer[0], AC41.outer[1])));
  const step = (outer.share ?? 0) - (inner.share ?? 0);
  const fmt = (v: number | null): string => (v === null ? "n/a" : v.toFixed(3));
  const look = await activeLookId(page);
  const isDefault = look === DEFAULT_LOOK.id;
  check("AC41-mapa", isDefault && y1.share !== null && y1.share <= AC41.maxYellowFull,
    `look ${String(look)} (DEFAULT_LOOK = ${DEFAULT_LOOK.id}); t = 1, medium, movimiento reducido: ${terrainPx} pixeles de terreno, amarillo ${fmt(y1.share)} (${y1.yellow} amarillos, ${y1.green} verdes; tope ${AC41.maxYellowFull})`);
  check("AC41-anillo", isDefault && bed.on > 0 && inner.share !== null && outer.share !== null && step <= AC41.maxRingStep,
    `t = 0,55, cama de pasto en (${bed.x.toFixed(1)}, ${bed.z.toFixed(1)}), radio ${R.toFixed(1)} m, encendida ${bed.on.toFixed(2)}: anillo de adentro ${fmt(inner.share)} (${inner.yellow + inner.green} px), de afuera ${fmt(outer.share)} (${outer.yellow + outer.green} px), paso ${step.toFixed(3)} (tope ${AC41.maxRingStep})`);

  await act(`actions.setTierChoice(${JSON.stringify(before.tier)}); actions.setReduceMotion(${String(before.reduce)})`);
  await waitGame(page, `s.world.dioramaStatus === "ready"`, 30_000);
  await act(`actions.zoomTo(${t0})`);
  await page.waitForTimeout(3000);
}

async function walkThirdPerson(page: Page): Promise<void> {
  // AC28 (c): three 120 px drags released over the ground: they look (the yaw changes) and do not walk. The total leaves the
  // camera facing east, along the dock path (yaw 270), so W has a clear field.
  await shot(page, "ac28-antes");
  const start = await camState(page);
  const drags = [];
  for (let i = 0; i < 3; i++) drags.push(await dragOverGround(page, 120));
  const looked = await camState(page);
  const dragOk = drags.every((d) => d !== null && d.moved <= 0.05 && Math.abs(d.yawChange) > 5 && d.intentAfterDrag !== "path" && d.proofClick === "path");
  check("AC28-drag", dragOk, `3 arrastres de 120 px soltados sobre el suelo: yaw ${start.yaw.toFixed(1)} -> ${looked.yaw.toFixed(1)}; ${drags
    .map((d, i) => (d ? `#${i + 1} se movio ${d.moved.toFixed(3)} m, giro ${d.yawChange.toFixed(1)}, intencion ${d.intentAfterDrag}, clic de 2 px en el pixel de soltar -> ${d.proofClick}` : `#${i + 1} sin suelo en pantalla`))
    .join("; ")}`);

  // AC28 (a): W for 1,000 ms advances 3 to 4.5 m where the camera looks.
  const w0 = await camState(page);
  await hold(page, "KeyW", 1000);
  await settle(page);
  const w1 = await camState(page);
  const fwd = forwardWalkOk(w0.pos, w1.pos, w0.yaw);
  check("AC28-W", fwd.ok, `W 1 s: ${fwd.along.toFixed(2)} m adelante (3 a 4,5), ${fwd.side.toFixed(2)} m de costado, yaw ${w0.yaw.toFixed(1)}`);

  // AC28 (b): Q 500 ms and then W: the march turned the same as the yaw (10 degrees tolerance).
  await hold(page, "KeyQ", 500);
  await page.waitForTimeout(200);
  const q0 = await camState(page);
  await hold(page, "KeyW", 600);
  await settle(page);
  const q1 = await camState(page);
  const turn = turnFollowsYaw({ x: w1.pos.x - w0.pos.x, z: w1.pos.z - w0.pos.z }, { x: q1.pos.x - q0.pos.x, z: q1.pos.z - q0.pos.z }, angleDelta(w0.yaw, q0.yaw));
  check("AC28-Q", turn.ok, `Q giro el yaw ${angleDelta(w0.yaw, q0.yaw).toFixed(1)} grados y la marcha ${turn.rotated.toFixed(1)}`);
  await shot(page, "ac28-despues");

  // AC29 (a): short click on a ground point 8 m to the east: arrives within 0.5 m. Recorded change
  // (open-world-3d T6): before, the point went to z 11.5 (north of the small dock's path, far from the ray to NPC-MITAYO);
  // on the big map the spawn is at (-48, 30) and Mitayo 45 m away, so the point is the one 8 m east of the player.
  const here = (await camState(page)).pos;
  const goal = { x: here.x + 8, z: here.z };
  const goalYaw = 270; // face east so the point is on screen
  await drag(page, angleDelta(goalYaw, (await camState(page)).yaw) / 0.25);
  await page.waitForTimeout(800);
  const px = await groundToScreen(page, goal);
  let reached = false;
  let target = "sin clic";
  if (px) {
    await page.mouse.click(px.x, px.y);
    target = await page.evaluate<string>(`import("/src/state/store.ts").then((m) => {
      const it = m.gameStore.getState().player.intent;
      const w = it.kind === "path" ? it.waypoints[it.waypoints.length - 1] : null;
      return w ? "(" + w.x.toFixed(2) + ", " + w.z.toFixed(2) + ")" : it.kind;
    })`);
    await waitGame(page, `Math.hypot(s.player.position.x - ${goal.x}, s.player.position.z - ${goal.z}) < 0.5`, 15_000)
      .then(() => { reached = true; }).catch(() => undefined);
  }
  if (reached) await settle(page, 200);
  const atGoal = (await camState(page)).pos;
  reached = reached && Math.hypot(atGoal.x - goal.x, atGoal.z - goal.z) < 0.5; // where it stopped, not just on passing
  // If it fails, what is needed to reproduce it in a unit test: output, intent, points left, speed.
  const why = reached ? null : await intentNow(page);
  const fmt = (p: P2): string => `(${p.x.toFixed(3)}, ${p.z.toFixed(3)})`;
  check("AC29-clic", reached, `clic en (${goal.x.toFixed(1)}, ${goal.z.toFixed(1)}) a ${Math.hypot(goal.x - here.x, goal.z - here.z).toFixed(1)} m; destino del store ${target}; quedo en (${atGoal.x.toFixed(2)}, ${atGoal.z.toFixed(2)}), a ${Math.hypot(atGoal.x - goal.x, atGoal.z - goal.z).toFixed(2)} m${why
    ? `; salida ${fmt(here)}, intencion ${why.kind}, quedan ${why.left.length} puntos [${why.left.map(fmt).join(" ")}], velocidad ${fmt(why.v)}`
    : ""}`);

  // AC29 (b): talking to NPC-MITAYO moves to dialogueFrame and on closing returns to thirdPerson with the same yaw (1 degree) and t (0.01).
  await walkToNpc(page, "NPC-MITAYO");
  await settle(page, 300);
  const pre = await camState(page);
  await page.click("#world-talk");
  await page.waitForSelector("[data-testid='dialogue-hud']", { timeout: 15_000 });
  await page.waitForTimeout(800);
  const during = await camState(page);
  await shot(page, "ac29-charla");
  await leaveScene(page);
  await page.waitForTimeout(2500); // the transition back (3/s) and the smoothed zoom
  const post = await camState(page);
  const sameYaw = Math.abs(angleDelta(pre.yaw, post.yaw)) <= 1 && Math.abs(angleDelta(pre.yaw, post.rigYaw)) <= 1;
  const sameT = Math.abs(pre.t - post.t) <= 0.01 && Math.abs(pre.rigT - post.rigT) <= 0.01;
  check("AC29-charla", during.preset === "dialogueFrame" && post.preset === "thirdPerson" && sameYaw && sameT,
    `durante ${during.preset}, despues ${post.preset}; yaw ${pre.yaw.toFixed(2)} -> ${post.yaw.toFixed(2)} (dibujado ${post.rigYaw.toFixed(2)}), t ${pre.t.toFixed(3)} -> ${post.t.toFixed(3)} (dibujado ${pre.rigT.toFixed(3)} -> ${post.rigT.toFixed(3)})`);

  // AC30: V goes to the whole map; the player and the beacons of the three NPCs project inside the screen; the capture
  // passes the pixel rule; the second V returns to the previous distance (2 %).
  const v0 = await camState(page);
  await page.keyboard.press("KeyV");
  await page.waitForTimeout(2500);
  const full = await camState(page);
  const m = await cameraMatrices(page);
  // The beacons themselves (sprites with userData.beacon in the drawn scene), not the NPCs' positions: a hidden
  // or transparent beacon has to fail. The drei camera hangs from the scene; climb up to the root.
  const npcIds = await page.evaluate<string[]>(`import("/src/state/store.ts").then((m) => (m.gameStore.getState().world.diorama?.npcs ?? []).map((n) => n.id))`);
  const sprites = await page.evaluate<{ id: string; visible: boolean; opacity: number; p: [number, number, number] }[]>(`import("/src/world/runtime.ts").then(({ cameraLook }) => {
    let root = cameraLook.camera;
    while (root && root.parent) root = root.parent;
    const out = [];
    if (root) root.traverse((o) => {
      if (o.userData && typeof o.userData.beacon === "string") {
        const w = o.getWorldPosition(o.position.clone());
        out.push({ id: o.userData.beacon, visible: o.visible, opacity: o.material ? o.material.opacity : 0, p: [w.x, w.y, w.z] });
      }
    });
    return out;
  })`);
  const seen: BeaconSeen[] = sprites.map((b) => ({ id: b.id, visible: b.visible, opacity: b.opacity, ndc: projectWithMatrices(m.view, m.proj, b.p) }));
  const beacons = beaconsOk(seen, ["player", ...npcIds]);
  const stats = await canvasStats(page);
  await shot(page, "ac30-mapa-completo");
  check("AC30-mapa", full.overview && full.rigT > 0.99 && npcIds.length === 3 && beacons.ok && isNonUniform(stats),
    `t dibujado ${full.rigT.toFixed(3)}, distancia ${full.rigDist.toFixed(1)} m; ${sprites.length} sprites de baliza; ${beacons.detail.join(", ")}; colores ${stats.distinct}, dominante ${(stats.dominantShare * 100).toFixed(1)}%`);
  await page.keyboard.press("KeyV");
  await page.waitForTimeout(2500);
  const back = await camState(page);
  check("AC30-volver", !back.overview && Math.abs(back.rigDist / v0.rigDist - 1) <= 0.02,
    `distancia ${v0.rigDist.toFixed(2)} -> ${full.rigDist.toFixed(1)} -> ${back.rigDist.toFixed(2)} m`);
}

// ---------- nature and characters of the open world (open-world-3d T7: AC45, AC47) ----------

/**
 * The triangles of the trees in the current view, by renderer.info: everything that is not a tree tier is hidden
 * (`<species>:completo|liviano|impostor`), one frame is drawn with the canvas renderer and everything is shown again.
 */
const treeTriangles = (page: Page): Promise<{ triangles: number; calls: number; meshes: number }> => page.evaluate(`import("/src/world/runtime.ts").then(({ cameraLook, worldRenderer }) => {
  const cam = cameraLook.camera;
  const gl = worldRenderer.gl;
  if (!cam || !gl) return { triangles: -1, calls: -1, meshes: 0 };
  let root = cam;
  while (root.parent) root = root.parent;
  const hidden = [];
  let meshes = 0;
  root.traverse((o) => {
    if (!(o.isMesh || o.isSprite || o.isPoints || o.isLine) || !o.visible) return;
    if (/:(completo|liviano|impostor)$/.test(o.name)) { meshes += 1; return; }
    o.visible = false;
    hidden.push(o);
  });
  const auto = gl.info.autoReset;
  gl.info.autoReset = false;
  gl.info.reset();
  gl.render(root, cam);
  const out = { triangles: gl.info.render.triangles, calls: gl.info.render.calls, meshes };
  gl.info.reset();
  gl.info.autoReset = auto;
  for (const o of hidden) o.visible = true;
  return out;
})`);

/** Turns the view `deg` degrees (the semantic "look" action of R10, 0.25 degrees per px) and waits for the camera to arrive. */
async function turnBy(page: Page, deg: number): Promise<void> {
  await page.evaluate(`import("/src/state/actions.ts").then(({ actions }) => actions.dispatch({ type: "look", dx: ${-deg / 0.25}, dy: 0 }))`);
  await page.waitForTimeout(1500);
}

/**
 * AC45 (Walk): at the spawn, facing the forest more tree triangles are drawn than facing away (renderer.info). The
 * forest is the densest of four headings at 90 degrees; facing away, the opposite one. AC47 (Walk): the player and the open-world
 * NPCs are the Quaternius character (`Head` bones), the player with their cap.
 */
const AWAY_MAX_SHARE = 0.6;

async function walkForest(page: Page): Promise<void> {
  await page.waitForFunction(`import("/src/world/runtime.ts").then(({ cameraLook }) => {
    let root = cameraLook.camera;
    while (root && root.parent) root = root.parent;
    let n = 0;
    if (root) root.traverse((o) => { if (/:(completo|liviano|impostor)$/.test(o.name) && o.count > 0) n += 1; });
    return n > 0;
  })`, undefined, { timeout: 30_000 });
  const views: { yaw: number; triangles: number; calls: number }[] = [];
  for (let k = 0; k < 4; k++) {
    const t = await treeTriangles(page);
    const c = await camState(page);
    views.push({ yaw: c.yaw, triangles: t.triangles, calls: t.calls });
    await turnBy(page, 90);
  }
  const forest = views.reduce((a, b) => (b.triangles > a.triangles ? b : a));
  const away = views[(views.indexOf(forest) + 2) % 4] as (typeof views)[number];
  // AC45 ("facing away draws fewer tree triangles"), QA's fix 1: "fewer" with teeth. Measured 0.38 (8,070 / 21,056);
  // without the frustum test the ratio rises to 0.94, so the 0.6 cap separates the two cases.
  check("AC45-walk", forest.triangles > 0 && away.triangles <= AWAY_MAX_SHARE * forest.triangles,
    `triangulos de arbol por rumbo: ${views.map((v) => `${v.yaw.toFixed(0)}°: ${v.triangles} (${v.calls} llamadas)`).join(", ")}; bosque ${forest.triangles}, de espaldas ${away.triangles} (proporción ${(away.triangles / Math.max(1, forest.triangles)).toFixed(2)}, tope ${AWAY_MAX_SHARE})`);

  const rigs = await page.evaluate<{ quaternius: number; kaykit: number; caps: number }>(`import("/src/world/runtime.ts").then(({ cameraLook }) => {
    let root = cameraLook.camera;
    while (root && root.parent) root = root.parent;
    const out = { quaternius: 0, kaykit: 0, caps: 0 };
    root.traverse((o) => {
      if (o.isSkinnedMesh) {
        const names = o.skeleton.bones.map((b) => b.name);
        if (names.includes("Head")) out.quaternius += 1;
        else if (names.includes("head")) out.kaykit += 1;
      }
      if (o.isMesh && !o.isSkinnedMesh && o.parent && o.parent.isBone && o.parent.name === "Head" && o.visible && o.geometry.getAttribute("position").count > 100) out.caps += 1;
    });
    return out;
  })`);
  await shot(page, "ac47-personajes");
  check("AC47-walk", rigs.quaternius >= 4 && rigs.kaykit === 0 && rigs.caps >= 1,
    `cuerpos de Quaternius ${rigs.quaternius} (jugador y 3 NPCs), de KayKit ${rigs.kaykit}, accesorios de cabeza visibles ${rigs.caps}`);
}

// ---------- grass and crowns (open-world-3d T8: AC51) ----------

/**
 * Draws the frame twice in the same task with the canvas renderer (like tools/defects.cjs): with everything, and with what
 * satisfies `hide` (a JS predicate over `o`) hidden; reads both with readPixels before yielding the thread (without
 * preserveDrawingBuffer) and returns them top to bottom. Nothing animates between one and the other.
 */
async function renderTwice(page: Page, hide: string): Promise<{ a: Rgba; b: Rgba; hidden: number }> {
  const r = await page.evaluate<{ w: number; h: number; a: string; b: string; hidden: number }>(`import("/src/world/runtime.ts").then(({ cameraLook, worldRenderer }) => {
    const cam = cameraLook.camera;
    const gl = worldRenderer.gl;
    let root = cam;
    while (root.parent) root = root.parent;
    const ctx = gl.getContext();
    const grab = () => {
      gl.setRenderTarget(null);
      gl.render(root, cam);
      const w = ctx.drawingBufferWidth, h = ctx.drawingBufferHeight, px = new Uint8Array(w * h * 4), out = new Uint8Array(w * h * 4);
      ctx.readPixels(0, 0, w, h, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
      for (let y = 0; y < h; y++) out.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
      let s = "";
      for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
      return { w, h, b64: btoa(s) };
    };
    const list = [];
    root.traverse((o) => { if ((${hide})(o) && o.visible) list.push(o); });
    const a = grab();
    for (const o of list) o.visible = false;
    const b = grab();
    for (const o of list) o.visible = true;
    return { w: a.w, h: a.h, a: a.b64, b: b.b64, hidden: list.length };
  })`);
  const img = (b64: string): Rgba => ({ width: r.w, height: r.h, data: new Uint8Array(Buffer.from(b64, "base64")) });
  return { a: img(r.a), b: img(r.b), hidden: r.hidden };
}

const IS_GRASS = "(o) => o.isInstancedMesh && /^pasto:/.test(o.name)";
/** A tree (mockup `treeMeshes`): a drawn tree tier whose geometry exceeds 4 m (shrubs do not count). */
const IS_TREE = "(o) => o.isInstancedMesh && /:(completo|liviano|impostor)$/.test(o.name) && o.count > 0 && o.visible"
  + " && ((o.geometry.boundingBox || (o.geometry.computeBoundingBox(), o.geometry.boundingBox)).max.y > 4)";

/** The drawn trees projected (mockup `trees`): crown center at 60 % of the height and radius 0.3 of the height, in px. */
const projectedTrees = (page: Page): Promise<ProjectedTree[]> => page.evaluate<ProjectedTree[]>(`import("/src/world/runtime.ts").then(({ cameraLook, worldRenderer }) => {
  const cam = cameraLook.camera;
  const ctx = worldRenderer.gl.getContext();
  const w = ctx.drawingBufferWidth, h = ctx.drawingBufferHeight;
  let root = cam;
  while (root.parent) root = root.parent;
  cam.updateMatrixWorld();
  const V3 = cam.position.constructor, M4 = cam.matrixWorld.constructor, Q = cam.quaternion.constructor;
  const M = new M4(), pos = new V3(), q = new Q(), sc = new V3(), right = new V3().setFromMatrixColumn(cam.matrixWorld, 0);
  const project = (v) => { const p = v.clone().project(cam); return [Math.round((p.x * 0.5 + 0.5) * w), Math.round((0.5 - p.y * 0.5) * h), p.z]; };
  const out = [];
  root.traverse((im) => {
    if (!((${IS_TREE})(im)) || !im.visible) return;
    if (!im.geometry.boundingBox) im.geometry.computeBoundingBox();
    const H = Math.min(im.geometry.boundingBox.max.y, 16);
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, M);
      M.decompose(pos, q, sc);
      const c = pos.clone().add(new V3(0, H * sc.y * 0.6, 0));
      const [x, y, z] = project(c);
      const [x2, y2] = project(c.clone().addScaledVector(right, H * sc.y * 0.3));
      out.push({ x, y, z, r: Math.max(4, Math.round(Math.hypot(x2 - x, y2 - y))) });
    }
  });
  return out;
})`);

/** The effective camera pitch drawn: the camera elevation above the pivot (the mockup's `pitchEff`). */
const cameraPitch = (page: Page): Promise<number> => page.evaluate<number>(`import("/src/world/runtime.ts").then(({ cameraLook }) => {
  const c = cameraLook.camera.getWorldPosition(cameraLook.camera.position.clone());
  const d = Math.hypot(c.x - cameraLook.x, c.y - cameraLook.y, c.z - cameraLook.z);
  return Math.asin(Math.max(-1, Math.min(1, (c.y - cameraLook.y) / d))) * 180 / Math.PI;
})`);

/** Grass poses of the mockup (tools/test.cjs GRASS_POSES): [zoom t, player pitch] give 30, 45 and 57°. */
export const AC51_GRASS_POSES = [[0.18, 30, 30], [0.3, 45, 45], [0.42, 55, 57]] as const;
/**
 * The crown pitch: the third-person default (@lg/core THIRD_PERSON.defaultPitchDeg; the Walk runs
 * in Node without a build and @lg/core is not imported here: browser-walk.test.ts pins that they are equal).
 */
export const AC51_TREE_PITCH = 17;
/** Crown zooms (tools/test.cjs TREE_ZOOMS). */
export const AC51_TREE_ZOOMS = [0.65, 0.72, 0.8, 0.9, 1] as const;
/**
 * From which zoom the crowns count for AC51 (D-844). Below it is the known defect K-1: at medium zoom the impostor shows
 * trunk and side cards under the crown. It is still measured and printed; on fixing K-1, lower this to 0.65.
 */
export const AC51_CROWN_GATE_FROM = 0.8;

/**
 * AC51 (LK6: DEFAULT_LOOK rule): on medium with reduced motion, the three defect captures of the mockup at the
 * spawn. Grass at 30, 45 and 57°: strips <= 0.12 with coverage >= 0.03 and yellow next to the grass <= 0.4. Crowns measured at t 0.65
 * to 1, gated from AC51_CROWN_GATE_FROM (D-844, K-1): median solidity >= 0.82, and at 0.9 and 1 at least 20 trees measured and 20th percentile >= 0.7. Leaves tier, reduced
 * motion, pitch and zoom as they were.
 */
async function walkDefects(page: Page): Promise<void> {
  const before = await page.evaluate<{ tier: string; reduce: boolean; pitch: number }>(`import("/src/state/store.ts").then((m) => {
    const s = m.gameStore.getState();
    return { tier: s.settings.graphics.tier, reduce: s.settings.accessibility.reduceMotion, pitch: s.ui.camera.pitchDeg };
  })`);
  const t0 = (await camState(page)).t;
  const act = (code: string): Promise<void> => page.evaluate(`import("/src/state/actions.ts").then(({ actions }) => { ${code}; })`);
  const pose = async (t: number, pitch: number): Promise<number> => {
    await page.evaluate(`import("/src/state/store.ts").then(({ gameStore }) => { const s = gameStore.getState(); gameStore.setState({ ui: { ...s.ui, camera: { ...s.ui.camera, pitchDeg: ${pitch} } } }); })`);
    await act(`actions.zoomTo(${t})`);
    await page.waitForTimeout(1500); // reduced motion: the camera cuts; the grass sweeps and rises on settling
    return cameraPitch(page);
  };
  await act(`actions.setTierChoice("medium"); actions.setReduceMotion(true)`);
  await waitGame(page, `s.world.dioramaStatus === "ready"`, 30_000);
  await page.waitForTimeout(4000); // the medium scene and its maps
  const look = await activeLookId(page);
  const isDefault = look === DEFAULT_LOOK.id;
  const grass: { pitch: number; coverage: number; strips: number; yellow: number; hidden: number }[] = [];
  for (const [t, p] of AC51_GRASS_POSES) {
    const pitch = await pose(t, p);
    const two = await renderTwice(page, IS_GRASS);
    const vis = await worldVisible(page, two.a.width, two.a.height);
    grass.push({ pitch, ...grassDefects(two.a, two.b, vis), hidden: two.hidden });
    await shot(page, `ac51-pasto-${p}`);
  }
  // The crowns are measured facing the forest: of 8 headings (every 45°) at the spawn, the one with the most trees on screen at
  // t 0.9 (the largest sample; the choice looks at how many, never at solidity). The mockup measured at its spawn.
  const setYaw = (y: number): Promise<void> => page.evaluate(`import("/src/state/store.ts").then(({ gameStore }) => { const s = gameStore.getState(); gameStore.setState({ ui: { ...s.ui, camera: { ...s.ui.camera, yawDeg: ${y} } } }); })`);
  const yaw0 = (await camState(page)).yaw;
  let forest = { yaw: yaw0, n: -1 };
  for (let k = 0; k < 8; k++) {
    const y = (yaw0 + k * 45) % 360;
    await setYaw(y);
    await pose(0.9, AC51_TREE_PITCH);
    const n = (await projectedTrees(page)).length;
    if (n > forest.n) forest = { yaw: y, n };
  }
  await setYaw(forest.yaw);
  const trees: { t: number; trees: number; measured: number; median: number; p20: number }[] = [];
  for (const t of AC51_TREE_ZOOMS) {
    await pose(t, AC51_TREE_PITCH);
    const items = await projectedTrees(page);
    const two = await renderTwice(page, IS_TREE);
    trees.push({ t, ...crownSolidity(diffMask(two.a, two.b), two.a.width, two.a.height, items) });
    if (t === 0.9) await shot(page, "ac51-copas-090");
  }
  const fmtG = grass.map((g) => `${g.pitch.toFixed(0)}°: tiras ${g.strips}, cobertura ${g.coverage}, amarillo ${g.yellow} (${g.hidden} mallas)`).join("; ");
  const pitchesOk = grass.every((g, i) => Math.abs(g.pitch - ((AC51_GRASS_POSES[i] as readonly number[])[2] as number)) <= 2);
  check("AC51-tiras", isDefault && pitchesOk && grass.every((g) => g.strips <= AC51.maxStrips && g.coverage >= AC51.minCoverage),
    `look ${String(look)}; ${fmtG} (tiras <= ${AC51.maxStrips}, cobertura >= ${AC51.minCoverage})`);
  check("AC51-amarillo", isDefault && pitchesOk && grass.every((g) => g.yellow <= AC51.maxYellow), `amarillo junto al pasto: ${grass.map((g) => g.yellow).join(", ")} (tope ${AC51.maxYellow})`);
  const gated = trees.filter((r) => r.t >= AC51_CROWN_GATE_FROM);
  check("AC51-copas", isDefault && gated.length > 0 && gated.every((r) => r.median >= AC51.crown && (r.t < 0.9 || (r.measured >= AC51.minTrees && r.p20 >= AC51.crownP20))),
    `rumbo ${forest.yaw.toFixed(0)}° (${forest.n} árboles a t 0,9); ` + trees.map((r) => `t ${r.t}${r.t < AC51_CROWN_GATE_FROM ? " [K-1, sin gate]" : ""}: ${r.measured}/${r.trees} medidos, mediana ${r.median}, p20 ${r.p20}`).join("; ") + ` (desde t ${AC51_CROWN_GATE_FROM}: mediana >= ${AC51.crown}; a 0,9 y 1, >= ${AC51.minTrees} y p20 >= ${AC51.crownP20})`);
  console.log(`[walk] DEFECT_TABLE ${JSON.stringify({ grass, trees })}`);

  await page.evaluate(`import("/src/state/store.ts").then(({ gameStore }) => { const s = gameStore.getState(); gameStore.setState({ ui: { ...s.ui, camera: { ...s.ui.camera, pitchDeg: ${before.pitch}, yawDeg: ${yaw0} } } }); })`);
  await act(`actions.setTierChoice(${JSON.stringify(before.tier)}); actions.setReduceMotion(${String(before.reduce)})`);
  await waitGame(page, `s.world.dioramaStatus === "ready"`, 30_000);
  await act(`actions.zoomTo(${t0})`);
  await page.waitForTimeout(3000);
}

// ---------- the big map's chain running (open-world-3d T8: AC52, the M3 gate) ----------

/** The AC52 run: from the spawn, running, the time and capture on reaching each NPC for the first time. */
const tour: { start: number | null; walkingMs: number; visits: Map<string, { atMs: number; walkMs: number; running: boolean; img: Rgba }> } = {
  start: null, walkingMs: 0, visits: new Map(),
};

/** Returns to the spawn saved on entry (like the probe's `spawn` pose) and runs (the Shift `run` action, R10). */
async function startTour(page: Page): Promise<void> {
  await page.evaluate(`(async () => {
    const { gameStore } = await import("/src/state/store.ts");
    const { actions } = await import("/src/state/actions.ts");
    const sp = globalThis.__lgWalkSpawn;
    const s = gameStore.getState();
    gameStore.setState({ player: { ...s.player, position: sp.position, previous: sp.position, cell: sp.cell, path: [] } });
    actions.dispatch({ type: "run", on: true });
  })()`);
  await page.waitForTimeout(1500);
  tour.start = Date.now();
  tour.walkingMs = 0;
  tour.visits.clear();
}

/** On reaching an NPC (walkToNpc path): if the run is going and it is the first time, time and capture. */
async function recordVisit(page: Page, npcId: string, walkMs: number): Promise<void> {
  if (tour.start === null) return;
  tour.walkingMs += walkMs;
  if (tour.visits.has(npcId)) return;
  await settle(page, 300);
  const running = await page.evaluate<boolean>(`import("/src/state/store.ts").then((m) => m.gameStore.getState().player.running)`);
  await shot(page, `ac52-${npcId.toLowerCase()}`);
  tour.visits.set(npcId, { atMs: Date.now() - tour.start, walkMs: tour.walkingMs, running, img: await canvasImage(page) });
}

/** AC52: the chain ended with the closing line, three NPCs visited running and three distinct views pairwise. */
function checkTour(closingLine: boolean): void {
  const v = [...tour.visits.entries()];
  const distinct = pairwiseDistinct(v.map(([, x]) => x.img));
  const times = v.map(([id, x]) => `${id} a ${(x.atMs / 1000).toFixed(1)} s (caminando ${(x.walkMs / 1000).toFixed(1)} s${x.running ? ", corriendo" : ", SIN correr"})`).join("; ");
  check("AC52", closingLine && v.length === 3 && v.every(([, x]) => x.running) && distinct.ok,
    `linea de cierre ${closingLine}; desde la aparicion: ${times}; dHash de a pares ${distinct.distances.join(", ")} (umbral > ${AC52.minDistance})`);
  tour.start = null;
}

// ---------- the two walks ----------

async function walkUniverse(page: Page, url: string): Promise<void> {
  await page.goto(`${url}/?universe=${UNIVERSE}&voz=0`);
  await enterWorld(page);
  await saveSpawn(page);
  const stats = await canvasStats(page);
  await shot(page, "ac12-muelle");
  check("AC12", isNonUniform(stats), `colores ${stats.distinct} (min ${MIN_DISTINCT_COLORS}), dominante ${(stats.dominantShare * 100).toFixed(1)}% (max ${MAX_DOMINANT_SHARE * 100}%)`);
  // AC39 (open-world-3d T6): the same default view, just entered: gradient sky, blue on top, grass below.
  // LK6 (T7b): it is a DEFAULT_LOOK rule; runs against that explicit look.
  const skyImg = await canvasImage(page);
  const sky = skyCheck(skyImg, await horizonRow(page), await worldTop(page), await worldVisible(page, skyImg.width, skyImg.height), await skyMask(page, skyImg));
  const skyLook = await activeLookId(page);
  check("AC39", skyLook === DEFAULT_LOOK.id && sky.ok && isNonUniform(stats), `look ${String(skyLook)} (DEFAULT_LOOK = ${DEFAULT_LOOK.id}); ${sky.detail}; regla de pixeles ${isNonUniform(stats)}`);
  await walkForest(page);
  await walkGround(page);
  await walkDefects(page);
  await walkThirdPerson(page);
  // AC52 (T8, the M3 gate): the AC16 chain from the spawn, running, with the click on each NPC.
  await startTour(page);

  const mitayo = await talkTo(page, "NPC-MITAYO");
  const heading = (await page.textContent("#scene-title")) ?? "";
  await shot(page, "ac13-mitayo-dialogo");
  check("AC13", heading.includes(mitayo), `aviso y boton con "${mitayo}", HUD de dialogo abierto ("${heading}")`);
  await leaveScene(page);

  await talkTo(page, "NPC-FACTOR");
  await page.waitForSelector("#scene-back", { timeout: 45_000 });
  const blocked = await hudText(page);
  const meters = await page.locator("[data-testid='conversation-panel']").count();
  await shot(page, "ac14-factor-bloqueado");
  check("AC14", blocked.includes("Todavía no se conocen") && meters === 0, `linea de no-presentado ${blocked.includes("Todavía no se conocen")}, paneles de medidores ${meters}`);
  await leaveScene(page);

  await talkTo(page, "NPC-MITAYO");
  await playTurns(page, ["Tell me about the mine."]);
  await leaveScene(page);
  await talkTo(page, "NPC-CERRO");
  await playTurns(page, ["What did you give the town?"]);
  await leaveScene(page);

  const factor = await walkToNpc(page, "NPC-FACTOR");
  await shot(page, "ac15-factor-aviso");
  check("AC15", true, `tras MITAYO y CERRO el aviso nombra a ${factor}`);
  await page.click("#world-talk");
  await page.waitForSelector("[data-testid='conversation-panel']", { timeout: 15_000 });

  await playTurns(page, FACTOR_TURNS);
  await page.waitForSelector("#scene-back", { timeout: 30_000 });
  const text = await hudText(page);
  const full = await page.evaluate<boolean>(`(() => {
    const ms = [...document.querySelectorAll("[data-testid='conversation-panel'] [role='img']")];
    return ms.length > 0 && ms.every((m) => /llen|compl|full/i.test(m.getAttribute("aria-label") || ""));
  })()`);
  await shot(page, "ac16-factor-leche");
  check("AC16", text.includes("The milk was never ours") && full, `linea de la leche ${text.includes("The milk was never ours")}, medidores llenos ${full}`);
  checkTour(text.includes("The milk was never ours"));
}

/** Saves the spawn (position and cell) on entry, so AC52 starts from there. */
const saveSpawn = (page: Page): Promise<void> => page.evaluate(`import("/src/state/store.ts").then(({ gameStore }) => {
  const s = gameStore.getState();
  globalThis.__lgWalkSpawn = { position: s.player.position, cell: s.player.cell };
})`);

/**
 * `LG_WALK_ONLY=defects` (open-world-3d T8): only enter the dock and the AC51 captures, for the red tests by
 * mutation (each one a short run instead of the whole walk). The normal walk does not use it.
 */
async function walkDefectsOnly(page: Page, url: string): Promise<void> {
  await page.goto(`${url}/?universe=${UNIVERSE}&voz=0`);
  await enterWorld(page);
  await walkDefects(page);
}

/** The turns that fill FACTOR's conversation with the scripted models (AC16; AC57 reuses them). */
const FACTOR_TURNS = [
  "Hello! What do you keep in those ledgers?",
  "I'm Nico. Does the silver really stay in Spain?",
  "I work far from here. Who owns the mine, really?",
  "I want to understand why Spain stayed poor.",
  "Where did all the silver really go?",
  "Thanks.",
] as const;

// ---------- minimap (open-world-3d T9, AC55 in real pixels and AC57) ----------

/** A pixel of the pending NPC dot: the red of @lg/art `MINIMAP_NPC_RED` (#FF5448) with a smoothing margin. */
export const isMinimapRed = (r: number, g: number, b: number): boolean => r >= 200 && g <= 130 && b <= 130 && r - g >= 100;
/** A group of fewer red pixels than this is a smoothed edge, not a dot. */
export const MIN_RED_CLUSTER_PX = 6;
/** AC55: at most 24 px from the right and bottom edge; side of 160 px (desktop) and 112 px (phone). */
export const MINIMAP_MAX_INSET_PX = 24;
export const MINIMAP_SIDE_PX = { desktop: 160, phone: 112 } as const;
/**
 * The expected side at the game's text size: the minimap is in rem like the rest of the HUD (160 and 112 px are with
 * text at 100 %, 16 px root; by default the game uses 125 %, so it measures 200 and 140).
 */
export const minimapSideFor = (basePx: number, rootFontPx: number): number => basePx * rootFontPx / 16;

/** Connected red pixel groups (4-neighbors) of at least `minPx`: the minimap's red dots and arrows. */
export function redClusters(img: Rgba, minPx: number = MIN_RED_CLUSTER_PX): number {
  const { width: w, height: h, data } = img;
  const red = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) red[i] = isMinimapRed(data[i * 4] ?? 0, data[i * 4 + 1] ?? 0, data[i * 4 + 2] ?? 0) ? 1 : 0;
  let clusters = 0;
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (red[i] !== 1) continue;
    let size = 0;
    red[i] = 2;
    stack.push(i);
    while (stack.length > 0) {
      const j = stack.pop() as number;
      size++;
      const x = j % w;
      for (const k of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, j - w, j + w]) {
        if (k >= 0 && k < w * h && red[k] === 1) { red[k] = 2; stack.push(k); }
      }
    }
    if (size >= minPx) clusters++;
  }
  return clusters;
}

interface MinimapSeen { present: boolean; dots: number; red: number; box: { x: number; y: number; width: number; height: number } | null }

/** The minimap as the player sees it: whether it is there, how many `data-npc-id` rings it has, how many red groups and its box. */
async function minimapSeen(page: Page): Promise<MinimapSeen> {
  const map = page.locator("[data-testid='minimap-map']");
  if ((await map.count()) === 0) return { present: false, dots: 0, red: 0, box: null };
  const dots = await page.locator("[data-testid='minimap'] [data-npc-id]").count();
  return { present: true, dots, red: redClusters(await elementImage(page, "[data-testid='minimap-map']")), box: await map.boundingBox() };
}

/** AC55 in pixels: the side and the distance to the right and bottom edges in this viewport. */
async function minimapPlacement(page: Page, label: string, side: number): Promise<void> {
  await page.waitForSelector("[data-testid='minimap-map']", { timeout: 10_000 });
  await page.waitForTimeout(300);
  const vp = page.viewportSize() ?? { width: 0, height: 0 };
  const box = (await minimapSeen(page)).box;
  const rootFontPx = await page.evaluate<number>("parseFloat(getComputedStyle(document.documentElement).fontSize)");
  const want = minimapSideFor(side, rootFontPx);
  const right = box ? vp.width - (box.x + box.width) : -1;
  const bottom = box ? vp.height - (box.y + box.height) : -1;
  const ok = box !== null && Math.abs(box.width - want) <= 1 && Math.abs(box.height - want) <= 1
    && right >= 0 && right <= MINIMAP_MAX_INSET_PX && bottom >= 0 && bottom <= MINIMAP_MAX_INSET_PX;
  check(`AC55-${label}`, ok, `${vp.width}x${vp.height}: lado ${box?.width.toFixed(1)}x${box?.height.toFixed(1)} (pedido ${want.toFixed(1)}: ${side} con texto al 100 %, raíz ${rootFontPx} px), derecha ${right.toFixed(1)} px, abajo ${bottom.toFixed(1)} px (tope ${MINIMAP_MAX_INSET_PX})`);
}

/**
 * `LG_WALK_ONLY=minimap` (open-world-3d T9): the minimap's place at 1280x720 and 375x667 (AC55) and AC57: on spawning 3
 * red dots; after finishing MITAYO, CERRO and FACTOR, 2, 1 and 0 (DOM rings and red pixel groups); hidden with the
 * dialogue panel open and back with the same width and height. Four captures. Partial run (without the farmer map nor the
 * rest of the walk): exits with 1 by design, like `defects`.
 */
async function walkMinimapOnly(page: Page, url: string): Promise<void> {
  await page.goto(`${url}/?universe=${UNIVERSE}&voz=0`);
  await enterWorld(page);
  await minimapPlacement(page, "escritorio", MINIMAP_SIDE_PX.desktop);
  await page.setViewportSize({ width: 375, height: 667 });
  await minimapPlacement(page, "telefono", MINIMAP_SIDE_PX.phone);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(500);
  const start = await minimapSeen(page);
  await shot(page, "ac57-minimapa-3");
  check("AC57-3", start.dots === 3 && start.red === 3, `al aparecer: anillos ${start.dots}, grupos rojos ${start.red}`);
  const steps: [string, readonly string[], number][] = [
    ["NPC-MITAYO", ["Tell me about the mine."], 2],
    ["NPC-CERRO", ["What did you give the town?"], 1],
    ["NPC-FACTOR", FACTOR_TURNS, 0],
  ];
  for (const [npcId, turns, left] of steps) {
    await talkTo(page, npcId);
    const during = await minimapSeen(page);
    await playTurns(page, turns);
    await page.waitForSelector("#scene-back", { timeout: 45_000 });
    const outcome = await page.evaluate<string | null>(`import("/src/state/store.ts").then((m) => m.gameStore.getState().dialogue.outcome)`);
    await leaveScene(page);
    await page.waitForSelector("[data-testid='minimap-map']", { timeout: 10_000 });
    await page.waitForTimeout(400); // a few 100 ms redraws
    const after = await minimapSeen(page);
    await shot(page, `ac57-minimapa-${left}`);
    const sameSize = after.box !== null && start.box !== null && after.box.width === start.box.width && after.box.height === start.box.height;
    check(`AC57-${left}`, !during.present && after.dots === left && after.red === left && sameSize,
      `${npcId} (final ${outcome}): en la charla ${during.present ? "VISIBLE" : "oculto"}; después anillos ${after.dots}, grupos rojos ${after.red}, mismo tamaño ${sameSize}`);
  }
}

async function walkCampesino(page: Page, url: string): Promise<void> {
  await page.goto(`${url}/?voz=0`);
  await enterWorld(page);
  const stats = await canvasStats(page);
  await shot(page, "ac17-campesino");
  const name = await walkToNpc(page, "NPC-INES");
  check("AC17", isNonUniform(stats), `colores ${stats.distinct}, dominante ${(stats.dominantShare * 100).toFixed(1)}%, aviso con "${name}"`);
}

/**
 * Opens the browser of the GL mode for a walk (scripts/dev/gl-mode.ts: the finally of `withGlBrowser` closes it
 * no matter what, also with `--fail-on-purpose`). A renderer that is not the mode's is a failure of the run.
 */
async function withBrowser(exe: string, mode: GlMode, run: (page: Page) => Promise<void>, failOnPurpose: boolean): Promise<void> {
  await withGlBrowser(exe, { mode, headless: process.env["LG_WALK_HEADED"] !== "1", failOnPurpose }, async (page, info) => {
    check("GL", true, `modo ${info.mode}${info.adapterLuidFallback ? " (respaldo --use-adapter-luid)" : ""}, renderer ${info.renderer}`);
    const errors: string[] = [];
    // The 404 for /favicon.ico is requested by the browser itself (the app declares no icon): Chromium noise, not a game error.
    page.on("console", (m) => { if (m.type() === "error" && !m.location().url.endsWith("/favicon.ico")) errors.push(`${m.text()} (${m.location().url})`); });
    if (process.env["LG_WALK_DEBUG"] === "1") {
      page.on("websocket", (ws) => {
        console.log(`[walk:ws] abre ${ws.url()}`);
        ws.on("framesent", (f) => console.log(`[walk:ws] >> ${String(f.payload).slice(0, 160)}`));
        ws.on("framereceived", (f) => console.log(`[walk:ws] << ${String(f.payload).slice(0, 160)}`));
        ws.on("close", () => console.log("[walk:ws] cierra"));
      });
    }
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    try {
      await run(page);
    } catch (e) {
      await page.screenshot({ path: join(SHOTS_DIR, "fallo.png") }).catch(() => undefined);
      throw e;
    }
    check("console", errors.length === 0, errors.length === 0 ? "cero console.error" : errors.slice(0, 3).join(" | "));
  });
}

async function main(): Promise<void> {
  const failOnPurpose = process.argv.includes("--fail-on-purpose") || process.env["LG_WALK_FAIL"] === "1";
  let mode: GlMode;
  try {
    mode = parseGlMode(process.env["LG_GL"]);
  } catch (e) {
    console.error(`[walk] ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 2;
    return;
  }
  const exe = findChromium();
  if (!exe) {
    console.error("[walk] no hay Chromium en la cache de Playwright (ms-playwright). Este script no instala nada: instala uno o pasa LG_CHROMIUM=<ruta>.");
    process.exitCode = 2;
    return;
  }
  console.log(`[walk] chromium ${exe}`);
  mkdirSync(SHOTS_DIR, { recursive: true });
  rmSync(join(SHOTS_DIR, "fallo.png"), { force: true }); // the capture of an old failure must not confuse this run
  let stack: Stack | null = null;
  const onSignal = (): void => {
    void closeAllGlBrowsers().finally(() => { stack?.stop(); process.exit(130); });
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    stack = await startStack(UNIVERSE);
    if (process.env["LG_WALK_ONLY"] === "minimap") {
      await withBrowser(exe, mode, (page) => walkMinimapOnly(page, stack?.url ?? ""), failOnPurpose);
      throw new Error("LG_WALK_ONLY=minimap: corrida parcial (sin campesino ni cadena); no cuenta como caminata");
    }
    if (process.env["LG_WALK_ONLY"] === "defects") {
      await withBrowser(exe, mode, (page) => walkDefectsOnly(page, stack?.url ?? ""), failOnPurpose);
      throw new Error("LG_WALK_ONLY=defects: corrida parcial (sin campesino ni cadena); no cuenta como caminata");
    }
    await withBrowser(exe, mode, (page) => walkUniverse(page, stack?.url ?? ""), failOnPurpose);
    stack.stop();
    stack = await startStack(null);
    await withBrowser(exe, mode, (page) => walkCampesino(page, stack?.url ?? ""), failOnPurpose);
  } catch (e) {
    console.error(`[walk] ERROR ${e instanceof Error ? e.message : String(e)}`);
    check("run", false, "la caminata termino con error");
  } finally {
    stack?.stop();
  }
  const bad = checks.filter((c) => !c.ok);
  console.log(`[walk] ${checks.length - bad.length}/${checks.length} comprobaciones verdes`);
  process.exitCode = bad.length === 0 ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
