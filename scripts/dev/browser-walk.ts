// `npm run walk:browser` (M6.4 T8, D-815): excepcion acotada a D-016/C11, RATIFICADA 2026-10-27 (con condicion: el
// navegador siempre se cierra al terminar). Un solo script, a pedido, FUERA de `npm run verify`: levanta servidor y Vite
// propios (LG_OPERATOR_MODE=1, LG_FAKE_MODELS=1, puertos libres en 127.0.0.1, almacenes en memoria), abre el Chromium ya
// instalado (playwright-core, sin descargar nada) y camina el juego guardando capturas. Una caminata roja es un reporte,
// no un build roto.
//
// Reglas duras de este archivo:
//   - El navegador SIEMPRE se cierra al terminar: try/finally que cierra context y browser en exito, en falla y en error
//     lanzado (y ante SIGINT/SIGTERM). `--fail-on-purpose` (o LG_WALK_FAIL=1) lanza un error a proposito despues de abrir
//     el navegador para que QA compruebe que no queda ningun chromium vivo.
//   - Solo se matan los PIDs que este script arranco (nunca por nombre de proceso).
//   - "Caminar" usa las mismas acciones del store que el clic y el teclado (moveTo / interact) con el juego real corriendo;
//     el store se alcanza importando los modulos del propio Vite (misma instancia que la app).
//   - open-world-3d T2(f) (D-833, AC12): el GL sale de `LG_GL=gpu|igpu|swiftshader` (default `gpu`, la NVIDIA) por el
//     lanzador compartido scripts/dev/gl-mode.ts, que verifica el renderer desenmascarado y falla si no es el del modo; un
//     modo desconocido sale con 2 antes de abrir nada. El viewport es 1280x720 (el de la sonda y el mockup).
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
export const SHOTS_DIR = join(REPO_ROOT, "_(documento interno)");
export const UNIVERSE = "U-GALEANO";

/**
 * Umbrales del analisis de pixeles (AC12/AC17): colores cuantizados distintos y tope de un solo color. Reajustados UNA
 * vez sobre el render de la GPU (open-world-3d T3, S-OW-18; antes 12 y 0,6, del render de tiles en SwiftShader): el
 * muelle en formato maqueta medido en LG_GL=gpu dio 126 colores y 60,9 % de pasto dominante, y la campesino 141 y 35 %.
 * Prueba roja (misma cuantización): un recorte de solo pasto de esa captura da 6 colores y 96,5 %, y un color liso 1 y
 * 100 %; los dos fallan.
 */
export const MIN_DISTINCT_COLORS = 40;
export const MAX_DOMINANT_SHARE = 0.75;

export interface PixelStats { distinct: number; dominantShare: number }

/** AC12/AC17 (AC16 de open-world-3d): el mapa renderizado no es uniforme. Pura, para probarla sin navegador. */
export const isNonUniform = (s: PixelStats): boolean => s.distinct >= MIN_DISTINCT_COLORS && s.dominantShare <= MAX_DOMINANT_SHARE;

/** Carpeta de Chromium: LG_CHROMIUM manda; si no, el `chromium-*` mas nuevo de la cache de Playwright. Nunca instala. */
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

// ---------- procesos propios ----------

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

/** Mata SOLO el arbol de este PID (en Windows el hijo de node puede tener nietos). */
export function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill();
}

export interface Stack { url: string; stop: () => void }

/**
 * Servidor de escenas + Vite, con modo operador y modelos guionados, en puertos libres. `extraEnv` llega al servidor y a
 * Vite (la sonda de rendimiento pone ahi VITE_LG_PERF_PROBE=1). Con `previewDir` sirve ese build con `vite preview` (que
 * hereda el proxy de /scene) en lugar del servidor de desarrollo (la carga de `perf:probe --build`).
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

// ---------- navegador ----------

/**
 * El canvas del mundo 3D (la superficie `data-lg-world` de GameCanvas). Cambio registrado (open-world-3d T9): desde el
 * minimapa hay un segundo canvas (2D, en el shell, que va antes en el DOM), así que "el primer canvas" ya no es el mundo.
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

/** Cuantiza el canvas del mapa (3 bits por canal) y mide colores distintos y el color dominante. */
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

/** La captura de un elemento como RGBA (filas de arriba abajo), en pixeles CSS de su rectangulo. */
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

/** La captura del canvas del mundo como RGBA. */
const canvasImage = (page: Page): Promise<Rgba> => elementImage(page, WORLD_CANVAS);

const WORLD_READY = `document.querySelector(${JSON.stringify(WORLD_CANVAS)}) !== null`;

/** La marca del primer cuadro del mundo (@lg/core LOAD_MARKS.worldFirstFrame; browser-walk.test.ts fija que son iguales). */
export const WORLD_FIRST_FRAME_MARK = "lg:world-first-frame";

/** Menu: espera `#menu-world` habilitado y entra al mapa. */
export async function enterWorld(page: Page): Promise<void> {
  await page.waitForSelector("#menu-world:not([aria-disabled='true'])", { timeout: 30_000 });
  await page.click("#menu-world");
  await page.waitForFunction(WORLD_READY, undefined, { timeout: 30_000 });
  // waitGame: un predicado que devuelve la promesa de import() es truthy y no esperaba nada.
  await waitGame(page, `s.world.dioramaStatus === "ready"`, 30_000);
  // T10: el primer cuadro espera a compileAsync; se espera su marca (como la sonda) y después unos cuadros más.
  await page.waitForFunction(`performance.getEntriesByName(${JSON.stringify(WORLD_FIRST_FRAME_MARK)}).length > 0`, undefined, { timeout: 60_000 });
  await page.waitForTimeout(1500); // unos cuadros para que el render dibuje
}

/** Camina hacia el NPC (la accion que dispara el clic sobre el) y espera el aviso "hablar con <nombre>". */
async function walkToNpc(page: Page, npcId: string): Promise<string> {
  const t0 = Date.now();
  const name = await page.evaluate<string>(`(async () => {
    const { gameStore } = await import("/src/state/store.ts");
    const { actions } = await import("/src/state/actions.ts");
    const info = gameStore.getState().world.npcs.find((n) => n.id === ${JSON.stringify(npcId)});
    actions.interact(${JSON.stringify(npcId)});
    return info ? info.name : ${JSON.stringify(npcId)};
  })()`);
  // El aviso puede seguir nombrando al NPC anterior hasta llegar: se espera al nombre correcto.
  await page.waitForFunction(`(document.querySelector("#world-talk")?.textContent || "").includes(${JSON.stringify(name)})`, undefined, { timeout: 90_000 })
    .catch(async () => { throw new Error(`el aviso de ${npcId} dice "${(await page.textContent("#world-talk").catch(() => null)) ?? "(sin boton)"}" y se esperaba "${name}"`); });
  await recordVisit(page, npcId, Date.now() - t0); // AC52 (T8): solo mientras corre la recorrida desde la aparicion
  return name;
}

/** Espera a que pueda escribir, o a que la escena haya terminado. Devuelve true si todavia se puede escribir. */
async function nextHand(page: Page): Promise<boolean> {
  await page.waitForFunction(`(() => {
    const input = document.querySelector("#scene-input");
    const writable = input !== null && input.getAttribute("aria-disabled") !== "true";
    return writable || document.querySelector("#scene-back") !== null;
  })()`, undefined, { timeout: 30_000 });
  return (await page.$("#scene-back")) === null;
}

/** Juega los turnos por texto; corta cuando la escena termina. */
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

// ---------- tercera persona (open-world-3d M2: AC28, AC29, AC30) ----------

interface CamState { pos: P2; yaw: number; t: number; dist: number; overview: boolean; preset: string; rigYaw: number; rigT: number; rigDist: number }

/** Jugador y camara: lo pedido (store) y lo dibujado (CameraRig deja el yaw, el t y la distancia suavizados en cameraLook). */
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

/** Matrices de la camara dibujada y el rectangulo del canvas, para proyectar puntos del mundo. */
const cameraMatrices = (page: Page): Promise<{ view: number[]; proj: number[]; rect: { x: number; y: number; w: number; h: number } }> => page.evaluate(`(async () => {
  const { cameraLook } = await import("/src/world/runtime.ts");
  const c = cameraLook.camera;
  const r = document.querySelector(${JSON.stringify(WORLD_CANVAS)}).getBoundingClientRect();
  return { view: Array.from(c.matrixWorldInverse.elements), proj: Array.from(c.projectionMatrix.elements), rect: { x: r.left, y: r.top, w: r.width, h: r.height } };
})()`);

/**
 * Un punto del suelo a pixeles de la pagina (null si queda fuera de pantalla). Cambio registrado (open-world-3d T6): el
 * suelo ya no esta en y = 0; la altura sale de `worldGround.heightAt` (el mismo `heightAt` del terreno dibujado).
 */
async function groundToScreen(page: Page, p: P2): Promise<{ x: number; y: number } | null> {
  const m = await cameraMatrices(page);
  const y = await page.evaluate<number>(`import("/src/world/runtime.ts").then(({ worldGround }) => worldGround.heightAt(${p.x}, ${p.z}))`);
  const ndc = projectWithMatrices(m.view, m.proj, [p.x, y, p.z]);
  if (!onScreen(ndc)) return null;
  return { x: m.rect.x + ((ndc[0] + 1) / 2) * m.rect.w, y: m.rect.y + ((1 - ndc[1]) / 2) * m.rect.h };
}

/** Arrastre con el boton principal alrededor del centro del canvas, solo para girar la camara (AC28 usa dragOverGround). */
async function drag(page: Page, dx: number, dy = 0): Promise<void> {
  // Arrastres largos en tramos de 400 px, para no salir del viewport de 1280 px.
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

/** Intencion del jugador en el store: el tipo, los puntos que le quedan y la velocidad. */
const intentNow = (page: Page): Promise<{ kind: string; left: P2[]; v: P2 }> => page.evaluate(`import("/src/state/store.ts").then((m) => {
  const p = m.gameStore.getState().player;
  return { kind: p.intent.kind, left: p.intent.kind === "path" ? p.intent.waypoints.map((w) => ({ x: w.x, z: w.z })) : [], v: { x: p.velocity.x, z: p.velocity.z } };
})`);

/**
 * AC28 (c): un arrastre de `dx` px que empieza y se suelta sobre pixeles proyectados desde puntos del suelo a ~3 m
 * delante del jugador (misma profundidad, a izquierda y derecha), asi el raycast del suelo recibe el soltar y es el
 * descarte de arrastres (isDragClick) el que evita la caminata. Despues prueba que el pixel de soltar cae en el suelo:
 * un clic de 2 px ahi produce moveTo (camino), que se cancela enseguida. null si no hay suelo en pantalla.
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
  const halfM = dx / 2 / Math.max(1, Math.hypot(c1.x - c.x, c1.y - c.y)); // metros de costado para dx/2 px
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
  // Prueba de suelo: el mismo pixel de soltar, como clic de 2 px, camina (moveTo); se cancela y se espera quietud.
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
 * Espera una condicion sobre el estado del juego. El predicado de `waitForFunction` tiene que ser sincrono: una promesa
 * (`import(...).then(...)`) es un valor truthy y la espera pasaria de inmediato. Por eso el store queda primero en
 * `window.__lgWalkStore` y `cond` es una expresion sobre `s` (el estado actual).
 */
async function waitGame(page: Page, cond: string, timeout: number): Promise<void> {
  await page.evaluate(`import("/src/state/store.ts").then((m) => { window.__lgWalkStore = m.gameStore; })`);
  await page.waitForFunction(`(() => { const s = window.__lgWalkStore.getState(); return Boolean(${cond}); })()`, undefined, { timeout });
}

/** Espera a que el jugador quede quieto (velocidad del store en cero). */
const settle = (page: Page, ms = 600): Promise<void> =>
  waitGame(page, "Math.hypot(s.player.velocity.x, s.player.velocity.z) < 1e-3", 10_000).then(() => page.waitForTimeout(ms));

/** La fila del canvas (de arriba) donde cae el horizonte: un punto a 5 km por delante, a la altura de la camara. */
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

/** La primera fila del canvas que no tapa el HUD en la columna del centro (la barra del título va encima). */
const worldTop = (page: Page): Promise<number> => page.evaluate<number>(`(() => {
  const c = document.querySelector(${JSON.stringify(WORLD_CANVAS)});
  const r = c.getBoundingClientRect();
  const x = r.left + r.width / 2;
  for (let y = 0; y < r.height; y++) if (document.elementFromPoint(x, r.top + y + 0.5) === c) return y;
  return 0;
})()`);

/** Los pixeles del canvas que ningun elemento del HUD tapa (elementFromPoint es el canvas), cada 2 px. */
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

/** Muestra el terreno (todo objeto llamado "terreno" de la escena dibujada) o lo esconde. */
const setTerrainVisible = (page: Page, on: boolean): Promise<number> => page.evaluate<number>(`import("/src/world/runtime.ts").then(({ cameraLook }) => {
  let root = cameraLook.camera;
  while (root && root.parent) root = root.parent;
  let n = 0;
  if (root) root.traverse((o) => { if (o.name === "terreno") { o.visible = ${on}; n++; } });
  return n;
})`);

/**
 * La máscara del cielo de la captura `img` (open-world-3d M3, AC39): se dibuja el mismo cuadro con solo el cielo (todo
 * lo demás escondido, menos el grupo "cielo") y es cielo lo que no cambió (diffMask en 0), como la doble captura de AC41.
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
 * Open-world-3d T7b (LK6): el id del look del diorama montado. AC39 y AC41 son reglas de DEFAULT_LOOK (no del motor):
 * corren solo si el muelle se dibuja con DEFAULT_LOOK, y si no, fallan diciendo con qué look se dibujó.
 */
const activeLookId = (page: Page): Promise<string | null> =>
  page.evaluate<string | null>(`import("/src/world/runtime.ts").then(({ activeLook }) => activeLook.id)`);

/** Las dos capturas del mismo cuadro, con y sin terreno (como las de tools/defects.cjs), y la mascara del terreno. */

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
 * AC41 (open-world-3d T6): en medium con movimiento reducido, el mapa entero (t = 1) y la vista t = 0,55, cada una dos
 * veces (con y sin terreno). (1) Amarillo entre los pixeles de terreno a t = 1 a lo sumo 0,35. (2) A t = 0,55, el
 * amarillo del anillo justo fuera del borde de la cama de pasto (radio del pasto de medium) menos el del anillo justo
 * dentro, a lo sumo 0,15. Deja tier, movimiento reducido y zoom como estaban.
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
  await page.waitForTimeout(4000); // la escena de medium, sus mapas y el zoom suavizado
  const full = await withAndWithoutTerrain(page);
  await shot(page, "ac41-mapa-completo");
  const y1 = yellowShare(full.img, maskPixels(full.mask));
  const terrainPx = full.mask.reduce((n, v) => n + v, 0);

  await act("actions.zoomTo(0.55)");
  await page.waitForTimeout(2500);
  const mid = await withAndWithoutTerrain(page);
  await shot(page, "ac41-t055");
  // Cambio registrado (open-world-3d T8, re-sello de AC41): antes los anillos iban alrededor del jugador con el radio de
  // medium (24 m) y la cama apagada (`uGrassBed.w` = 0, paso ~0). Con el pasto de T8 la cama es la dibujada: su centro va
  // delante del jugador y su radio se achica con el zoom (a t = 0,55, unos 13 m), así que los anillos van alrededor de
  // ESE disco (runtime `grassBedView`, el `grassBed` del suelo). Umbrales sin cambio.
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
  // AC28 (c): tres arrastres de 120 px soltados sobre el suelo: miran (el yaw cambia) y no caminan. El total deja la
  // camara mirando al este, por el camino del muelle (yaw 270), para que W tenga campo libre.
  await shot(page, "ac28-antes");
  const start = await camState(page);
  const drags = [];
  for (let i = 0; i < 3; i++) drags.push(await dragOverGround(page, 120));
  const looked = await camState(page);
  const dragOk = drags.every((d) => d !== null && d.moved <= 0.05 && Math.abs(d.yawChange) > 5 && d.intentAfterDrag !== "path" && d.proofClick === "path");
  check("AC28-drag", dragOk, `3 arrastres de 120 px soltados sobre el suelo: yaw ${start.yaw.toFixed(1)} -> ${looked.yaw.toFixed(1)}; ${drags
    .map((d, i) => (d ? `#${i + 1} se movio ${d.moved.toFixed(3)} m, giro ${d.yawChange.toFixed(1)}, intencion ${d.intentAfterDrag}, clic de 2 px en el pixel de soltar -> ${d.proofClick}` : `#${i + 1} sin suelo en pantalla`))
    .join("; ")}`);

  // AC28 (a): W 1.000 ms avanza 3 a 4,5 m hacia donde mira la camara.
  const w0 = await camState(page);
  await hold(page, "KeyW", 1000);
  await settle(page);
  const w1 = await camState(page);
  const fwd = forwardWalkOk(w0.pos, w1.pos, w0.yaw);
  check("AC28-W", fwd.ok, `W 1 s: ${fwd.along.toFixed(2)} m adelante (3 a 4,5), ${fwd.side.toFixed(2)} m de costado, yaw ${w0.yaw.toFixed(1)}`);

  // AC28 (b): Q 500 ms y despues W: la marcha giro lo mismo que el yaw (10 grados de tolerancia).
  await hold(page, "KeyQ", 500);
  await page.waitForTimeout(200);
  const q0 = await camState(page);
  await hold(page, "KeyW", 600);
  await settle(page);
  const q1 = await camState(page);
  const turn = turnFollowsYaw({ x: w1.pos.x - w0.pos.x, z: w1.pos.z - w0.pos.z }, { x: q1.pos.x - q0.pos.x, z: q1.pos.z - q0.pos.z }, angleDelta(w0.yaw, q0.yaw));
  check("AC28-Q", turn.ok, `Q giro el yaw ${angleDelta(w0.yaw, q0.yaw).toFixed(1)} grados y la marcha ${turn.rotated.toFixed(1)}`);
  await shot(page, "ac28-despues");

  // AC29 (a): clic corto sobre un punto del suelo a 8 m al este: llega a menos de 0,5 m. Cambio registrado
  // (open-world-3d T6): antes el punto iba a z 11,5 (al norte del camino del muelle chico, lejos del rayo a NPC-MITAYO);
  // en el mapa grande la aparicion esta en (-48, 30) y Mitayo a 45 m, asi que el punto es el de 8 m al este del jugador.
  const here = (await camState(page)).pos;
  const goal = { x: here.x + 8, z: here.z };
  const goalYaw = 270; // mirar al este para que el punto este en pantalla
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
  reached = reached && Math.hypot(atGoal.x - goal.x, atGoal.z - goal.z) < 0.5; // donde se detuvo, no solo al pasar
  // Si falla, lo necesario para reproducirlo en una prueba unitaria: salida, intencion, puntos que quedan, velocidad.
  const why = reached ? null : await intentNow(page);
  const fmt = (p: P2): string => `(${p.x.toFixed(3)}, ${p.z.toFixed(3)})`;
  check("AC29-clic", reached, `clic en (${goal.x.toFixed(1)}, ${goal.z.toFixed(1)}) a ${Math.hypot(goal.x - here.x, goal.z - here.z).toFixed(1)} m; destino del store ${target}; quedo en (${atGoal.x.toFixed(2)}, ${atGoal.z.toFixed(2)}), a ${Math.hypot(atGoal.x - goal.x, atGoal.z - goal.z).toFixed(2)} m${why
    ? `; salida ${fmt(here)}, intencion ${why.kind}, quedan ${why.left.length} puntos [${why.left.map(fmt).join(" ")}], velocidad ${fmt(why.v)}`
    : ""}`);

  // AC29 (b): hablar con NPC-MITAYO pasa a dialogueFrame y al cerrar vuelve a thirdPerson con el mismo yaw (1 grado) y t (0,01).
  await walkToNpc(page, "NPC-MITAYO");
  await settle(page, 300);
  const pre = await camState(page);
  await page.click("#world-talk");
  await page.waitForSelector("[data-testid='dialogue-hud']", { timeout: 15_000 });
  await page.waitForTimeout(800);
  const during = await camState(page);
  await shot(page, "ac29-charla");
  await leaveScene(page);
  await page.waitForTimeout(2500); // la transicion de vuelta (3/s) y el zoom suavizado
  const post = await camState(page);
  const sameYaw = Math.abs(angleDelta(pre.yaw, post.yaw)) <= 1 && Math.abs(angleDelta(pre.yaw, post.rigYaw)) <= 1;
  const sameT = Math.abs(pre.t - post.t) <= 0.01 && Math.abs(pre.rigT - post.rigT) <= 0.01;
  check("AC29-charla", during.preset === "dialogueFrame" && post.preset === "thirdPerson" && sameYaw && sameT,
    `durante ${during.preset}, despues ${post.preset}; yaw ${pre.yaw.toFixed(2)} -> ${post.yaw.toFixed(2)} (dibujado ${post.rigYaw.toFixed(2)}), t ${pre.t.toFixed(3)} -> ${post.t.toFixed(3)} (dibujado ${pre.rigT.toFixed(3)} -> ${post.rigT.toFixed(3)})`);

  // AC30: V lleva al mapa entero; el jugador y las balizas de los tres NPCs se proyectan dentro de la pantalla; la captura
  // pasa la regla de pixeles; la segunda V vuelve a la distancia de antes (2 %).
  const v0 = await camState(page);
  await page.keyboard.press("KeyV");
  await page.waitForTimeout(2500);
  const full = await camState(page);
  const m = await cameraMatrices(page);
  // Las balizas mismas (sprites con userData.beacon en la escena dibujada), no las posiciones de los NPCs: una baliza
  // oculta o transparente tiene que fallar. La camara de drei cuelga de la escena; se sube hasta la raiz.
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

// ---------- naturaleza y personajes del mundo abierto (open-world-3d T7: AC45, AC47) ----------

/**
 * Los triángulos de los árboles en la vista de ahora, por renderer.info: se esconde todo lo que no es un nivel de árbol
 * (`<especie>:completo|liviano|impostor`), se dibuja un cuadro con el renderer del canvas y se vuelve a mostrar.
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

/** Gira la vista `deg` grados (la accion semantica "look" de R10, 0,25 grados por px) y espera que la camara llegue. */
async function turnBy(page: Page, deg: number): Promise<void> {
  await page.evaluate(`import("/src/state/actions.ts").then(({ actions }) => actions.dispatch({ type: "look", dx: ${-deg / 0.25}, dy: 0 }))`);
  await page.waitForTimeout(1500);
}

/**
 * AC45 (Walk): en la aparicion, de cara al bosque se dibujan mas triangulos de arbol que de espaldas (renderer.info). El
 * bosque es el mas denso de cuatro rumbos a 90 grados; de espaldas, el opuesto. AC47 (Walk): el jugador y los NPCs del
 * mundo abierto son el personaje de Quaternius (huesos `Head`), el jugador con su gorra.
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
  // AC45 ("facing away draws fewer tree triangles"), fix 1 de QA: "menos" con dientes. Medido 0,38 (8.070 / 21.056);
  // sin la prueba del frustum la proporción sube a 0,94, así que el tope 0,6 separa los dos casos.
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

// ---------- pasto y copas (open-world-3d T8: AC51) ----------

/**
 * Dibuja el cuadro dos veces en la misma tarea con el renderer del canvas (como tools/defects.cjs): con todo, y con lo
 * que cumple `hide` (un predicado JS sobre `o`) escondido; lee las dos con readPixels antes de ceder el hilo (sin
 * preserveDrawingBuffer) y las devuelve de arriba abajo. Nada se anima entre una y otra.
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
/** Un árbol (mockup `treeMeshes`): un nivel de árbol dibujado cuya geometría pasa de 4 m (los arbustos no cuentan). */
const IS_TREE = "(o) => o.isInstancedMesh && /:(completo|liviano|impostor)$/.test(o.name) && o.count > 0 && o.visible"
  + " && ((o.geometry.boundingBox || (o.geometry.computeBoundingBox(), o.geometry.boundingBox)).max.y > 4)";

/** Los árboles dibujados proyectados (mockup `trees`): centro de copa al 60 % del alto y radio de 0,3 del alto, en px. */
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

/** La inclinación efectiva de la cámara dibujada: la elevación de la cámara sobre el pivote (el `pitchEff` del mockup). */
const cameraPitch = (page: Page): Promise<number> => page.evaluate<number>(`import("/src/world/runtime.ts").then(({ cameraLook }) => {
  const c = cameraLook.camera.getWorldPosition(cameraLook.camera.position.clone());
  const d = Math.hypot(c.x - cameraLook.x, c.y - cameraLook.y, c.z - cameraLook.z);
  return Math.asin(Math.max(-1, Math.min(1, (c.y - cameraLook.y) / d))) * 180 / Math.PI;
})`);

/** Poses del pasto del mockup (tools/test.cjs GRASS_POSES): [t de zoom, inclinación del jugador] dan 30, 45 y 57°. */
export const AC51_GRASS_POSES = [[0.18, 30, 30], [0.3, 45, 45], [0.42, 55, 57]] as const;
/**
 * La inclinación de las copas: la por defecto de la tercera persona (@lg/core THIRD_PERSON.defaultPitchDeg; la Walk corre
 * en Node sin build y @lg/core no se importa acá: browser-walk.test.ts fija que son iguales).
 */
export const AC51_TREE_PITCH = 17;
/** Zooms de las copas (tools/test.cjs TREE_ZOOMS). */
export const AC51_TREE_ZOOMS = [0.65, 0.72, 0.8, 0.9, 1] as const;
/**
 * Desde qué zoom las copas cuentan para AC51 (D-844). Abajo es el defecto conocido K-1: a zoom medio el impostor muestra
 * tronco y tarjetas laterales bajo la copa. Se sigue midiendo e imprimiendo; al arreglar K-1, bajar esto a 0.65.
 */
export const AC51_CROWN_GATE_FROM = 0.8;

/**
 * AC51 (LK6: regla de DEFAULT_LOOK): en medium con movimiento reducido, las tres capturas de defectos del mockup en la
 * aparición. Pasto a 30, 45 y 57°: tiras <= 0,12 con cobertura >= 0,03 y amarillo junto al pasto <= 0,4. Copas medidas a t 0,65
 * a 1, con gate desde AC51_CROWN_GATE_FROM (D-844, K-1): mediana de solidez >= 0,82, y a 0,9 y 1 al menos 20 árboles medidos y percentil 20 >= 0,7. Deja tier, movimiento
 * reducido, inclinación y zoom como estaban.
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
    await page.waitForTimeout(1500); // movimiento reducido: la cámara corta; el pasto recorre y sube al asentarse
    return cameraPitch(page);
  };
  await act(`actions.setTierChoice("medium"); actions.setReduceMotion(true)`);
  await waitGame(page, `s.world.dioramaStatus === "ready"`, 30_000);
  await page.waitForTimeout(4000); // la escena de medium y sus mapas
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
  // Las copas se miden de cara al bosque: de 8 rumbos (cada 45°) en la aparición, el que tiene más árboles en pantalla a
  // t 0,9 (la muestra más grande; la elección mira cuántos, nunca la solidez). La maqueta medía en su aparición.
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

// ---------- la cadena del mapa grande corriendo (open-world-3d T8: AC52, la puerta de M3) ----------

/** La recorrida de AC52: desde la aparición, corriendo, el tiempo y la captura al llegar a cada NPC por primera vez. */
const tour: { start: number | null; walkingMs: number; visits: Map<string, { atMs: number; walkMs: number; running: boolean; img: Rgba }> } = {
  start: null, walkingMs: 0, visits: new Map(),
};

/** Vuelve a la aparición guardada al entrar (como la pose `spawn` de la sonda) y corre (la acción `run` de Shift, R10). */
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

/** Al llegar a un NPC (camino de walkToNpc): si la recorrida corre y es la primera vez, tiempo y captura. */
async function recordVisit(page: Page, npcId: string, walkMs: number): Promise<void> {
  if (tour.start === null) return;
  tour.walkingMs += walkMs;
  if (tour.visits.has(npcId)) return;
  await settle(page, 300);
  const running = await page.evaluate<boolean>(`import("/src/state/store.ts").then((m) => m.gameStore.getState().player.running)`);
  await shot(page, `ac52-${npcId.toLowerCase()}`);
  tour.visits.set(npcId, { atMs: Date.now() - tour.start, walkMs: tour.walkingMs, running, img: await canvasImage(page) });
}

/** AC52: la cadena terminó con la línea de cierre, tres NPCs visitados corriendo y tres vistas distintas de a pares. */
function checkTour(closingLine: boolean): void {
  const v = [...tour.visits.entries()];
  const distinct = pairwiseDistinct(v.map(([, x]) => x.img));
  const times = v.map(([id, x]) => `${id} a ${(x.atMs / 1000).toFixed(1)} s (caminando ${(x.walkMs / 1000).toFixed(1)} s${x.running ? ", corriendo" : ", SIN correr"})`).join("; ");
  check("AC52", closingLine && v.length === 3 && v.every(([, x]) => x.running) && distinct.ok,
    `linea de cierre ${closingLine}; desde la aparicion: ${times}; dHash de a pares ${distinct.distances.join(", ")} (umbral > ${AC52.minDistance})`);
  tour.start = null;
}

// ---------- las dos caminatas ----------

async function walkUniverse(page: Page, url: string): Promise<void> {
  await page.goto(`${url}/?universe=${UNIVERSE}&voz=0`);
  await enterWorld(page);
  await saveSpawn(page);
  const stats = await canvasStats(page);
  await shot(page, "ac12-muelle");
  check("AC12", isNonUniform(stats), `colores ${stats.distinct} (min ${MIN_DISTINCT_COLORS}), dominante ${(stats.dominantShare * 100).toFixed(1)}% (max ${MAX_DOMINANT_SHARE * 100}%)`);
  // AC39 (open-world-3d T6): la misma vista por defecto, recien entrado: cielo con gradiente, azul arriba, pasto abajo.
  // LK6 (T7b): es una regla de DEFAULT_LOOK; corre contra ese look explícito.
  const skyImg = await canvasImage(page);
  const sky = skyCheck(skyImg, await horizonRow(page), await worldTop(page), await worldVisible(page, skyImg.width, skyImg.height), await skyMask(page, skyImg));
  const skyLook = await activeLookId(page);
  check("AC39", skyLook === DEFAULT_LOOK.id && sky.ok && isNonUniform(stats), `look ${String(skyLook)} (DEFAULT_LOOK = ${DEFAULT_LOOK.id}); ${sky.detail}; regla de pixeles ${isNonUniform(stats)}`);
  await walkForest(page);
  await walkGround(page);
  await walkDefects(page);
  await walkThirdPerson(page);
  // AC52 (T8, la puerta de M3): la cadena de AC16 desde la aparicion, corriendo, con el clic sobre cada NPC.
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

/** Guarda la aparicion (posicion y celda) al entrar, para que AC52 arranque de ahi. */
const saveSpawn = (page: Page): Promise<void> => page.evaluate(`import("/src/state/store.ts").then(({ gameStore }) => {
  const s = gameStore.getState();
  globalThis.__lgWalkSpawn = { position: s.player.position, cell: s.player.cell };
})`);

/**
 * `LG_WALK_ONLY=defects` (open-world-3d T8): solo entrar al muelle y las capturas de AC51, para las pruebas rojas por
 * mutacion (cada una es una corrida corta en vez de la caminata entera). La caminata normal no lo usa.
 */
async function walkDefectsOnly(page: Page, url: string): Promise<void> {
  await page.goto(`${url}/?universe=${UNIVERSE}&voz=0`);
  await enterWorld(page);
  await walkDefects(page);
}

/** Los turnos que llenan la conversación de FACTOR con los modelos guionados (AC16; los reusa AC57). */
const FACTOR_TURNS = [
  "Hello! What do you keep in those ledgers?",
  "I'm Nico. Does the silver really stay in Spain?",
  "I work far from here. Who owns the mine, really?",
  "I want to understand why Spain stayed poor.",
  "Where did all the silver really go?",
  "Thanks.",
] as const;

// ---------- minimapa (open-world-3d T9, AC55 en píxeles reales y AC57) ----------

/** Un píxel del punto de NPC pendiente: el rojo de @lg/art `MINIMAP_NPC_RED` (#FF5448) con margen de suavizado. */
export const isMinimapRed = (r: number, g: number, b: number): boolean => r >= 200 && g <= 130 && b <= 130 && r - g >= 100;
/** Un grupo de menos píxeles rojos que esto es borde suavizado, no un punto. */
export const MIN_RED_CLUSTER_PX = 6;
/** AC55: a lo sumo 24 px del borde derecho e inferior; lado de 160 px (escritorio) y 112 px (teléfono). */
export const MINIMAP_MAX_INSET_PX = 24;
export const MINIMAP_SIDE_PX = { desktop: 160, phone: 112 } as const;
/**
 * El lado esperado con el tamaño de texto del juego: el minimapa va en rem como el resto del HUD (160 y 112 px son con
 * texto al 100 %, raíz de 16 px; por defecto el juego usa 125 %, así que mide 200 y 140).
 */
export const minimapSideFor = (basePx: number, rootFontPx: number): number => basePx * rootFontPx / 16;

/** Grupos de píxeles rojos conectados (vecinos de 4) de al menos `minPx`: los puntos y flechas rojas del minimapa. */
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

/** El minimapa como lo ve el jugador: si está, cuántos anillos `data-npc-id` tiene, cuántos grupos rojos y su caja. */
async function minimapSeen(page: Page): Promise<MinimapSeen> {
  const map = page.locator("[data-testid='minimap-map']");
  if ((await map.count()) === 0) return { present: false, dots: 0, red: 0, box: null };
  const dots = await page.locator("[data-testid='minimap'] [data-npc-id]").count();
  return { present: true, dots, red: redClusters(await elementImage(page, "[data-testid='minimap-map']")), box: await map.boundingBox() };
}

/** AC55 en píxeles: el lado y la distancia a los bordes derecho e inferior en este viewport. */
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
 * `LG_WALK_ONLY=minimap` (open-world-3d T9): el lugar del minimapa a 1280x720 y 375x667 (AC55) y AC57: al aparecer 3
 * puntos rojos; tras terminar MITAYO, CERRO y FACTOR, 2, 1 y 0 (anillos del DOM y grupos rojos de píxeles); oculto con el
 * panel de diálogo abierto y de vuelta con el mismo ancho y alto. Cuatro capturas. Corrida parcial (sin campesino ni el
 * resto de la caminata): sale con 1 por diseño, como `defects`.
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
    await page.waitForTimeout(400); // unos redibujos de 100 ms
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
 * Abre el navegador del modo de GL para una caminata (scripts/dev/gl-mode.ts: el finally de `withGlBrowser` lo cierra
 * pase lo que pase, tambien con `--fail-on-purpose`). Un renderer que no es el del modo es una falla de la corrida.
 */
async function withBrowser(exe: string, mode: GlMode, run: (page: Page) => Promise<void>, failOnPurpose: boolean): Promise<void> {
  await withGlBrowser(exe, { mode, headless: process.env["LG_WALK_HEADED"] !== "1", failOnPurpose }, async (page, info) => {
    check("GL", true, `modo ${info.mode}${info.adapterLuidFallback ? " (respaldo --use-adapter-luid)" : ""}, renderer ${info.renderer}`);
    const errors: string[] = [];
    // El 404 de /favicon.ico lo pide el propio navegador (la app no declara icono): ruido de Chromium, no un error del juego.
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
  rmSync(join(SHOTS_DIR, "fallo.png"), { force: true }); // la captura de una falla vieja no debe confundir a esta corrida
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
