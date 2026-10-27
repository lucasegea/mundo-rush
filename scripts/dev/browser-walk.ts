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
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer, connect } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const SHOTS_DIR = join(REPO_ROOT, "(documento interno)");
export const UNIVERSE = "U-GALEANO";

/** Umbrales del analisis de pixeles (AC12/AC17): colores cuantizados distintos y tope de un solo color. */
export const MIN_DISTINCT_COLORS = 12;
export const MAX_DOMINANT_SHARE = 0.6;

export interface PixelStats { distinct: number; dominantShare: number }

/** AC12/AC17: un mapa de tiles no es uniforme. Pura, para probarla sin navegador. */
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
function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill();
}

interface Stack { url: string; stop: () => void }

/** Servidor de escenas + Vite, con modo operador y modelos guionados, en puertos libres. */
async function startStack(universe: string | null): Promise<Stack> {
  const build = spawnSync(process.execPath, [join(REPO_ROOT, "scripts/content/build.ts"), ...(universe ? [`--universe=${universe}`] : [])], { cwd: REPO_ROOT, stdio: "inherit" });
  if (build.status !== 0) throw new Error(`el contenido ${universe ?? "campesino"} no compilo`);
  const [serverPort, webPort] = [await freePort(), await freePort()];
  const env: NodeJS.ProcessEnv = {
    ...process.env, LG_OPERATOR_MODE: "1", LG_FAKE_MODELS: "1", LG_PORT: String(serverPort),
    ...(universe ? { LG_UNIVERSE: universe } : {}),
  };
  if (!universe) delete env["LG_UNIVERSE"];
  const webDir = join(REPO_ROOT, "apps/web");
  const viteBin = join(dirname(createRequire(join(webDir, "package.json")).resolve("vite/package.json")), "bin/vite.js");
  const children: ChildProcess[] = [
    spawn(process.execPath, [join(REPO_ROOT, "apps/server/src/main.ts")], { cwd: REPO_ROOT, env, stdio: "inherit" }),
    spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], { cwd: webDir, env, stdio: "inherit" }),
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

/** Cierre garantizado: cada paso se intenta aunque el anterior falle, con tope de tiempo para no colgarse. */
async function closeBrowser(context: BrowserContext | null, browser: Browser | null): Promise<void> {
  const bounded = (p: Promise<unknown> | undefined): Promise<unknown> =>
    Promise.race([p ?? Promise.resolve(), new Promise((r) => setTimeout(r, 10_000))]).catch(() => undefined);
  await bounded(context?.close());
  await bounded(browser?.close());
}

/** Navegador vivo de la caminata en curso: las senales (Ctrl+C) lo cierran tambien. */
let live: { browser: Browser | null; context: BrowserContext | null } = { browser: null, context: null };

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
  const png = await page.locator("canvas").first().screenshot();
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

const WORLD_READY = "document.querySelector('canvas') !== null";

/** Menu: espera `#menu-world` habilitado y entra al mapa. */
async function enterWorld(page: Page): Promise<void> {
  await page.waitForSelector("#menu-world:not([aria-disabled='true'])", { timeout: 30_000 });
  await page.click("#menu-world");
  await page.waitForFunction(WORLD_READY, undefined, { timeout: 30_000 });
  await page.waitForFunction(`import("/src/state/store.ts").then((m) => m.gameStore.getState().world.dioramaStatus === "ready")`, undefined, { timeout: 30_000 });
  await page.waitForTimeout(1500); // unos cuadros para que el render dibuje
}

/** Camina hacia el NPC (la accion que dispara el clic sobre el) y espera el aviso "hablar con <nombre>". */
async function walkToNpc(page: Page, npcId: string): Promise<string> {
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

// ---------- las dos caminatas ----------

async function walkUniverse(page: Page, url: string): Promise<void> {
  await page.goto(`${url}/?universe=${UNIVERSE}&voz=0`);
  await enterWorld(page);
  const stats = await canvasStats(page);
  await shot(page, "ac12-muelle");
  check("AC12", isNonUniform(stats), `colores ${stats.distinct} (min ${MIN_DISTINCT_COLORS}), dominante ${(stats.dominantShare * 100).toFixed(1)}% (max ${MAX_DOMINANT_SHARE * 100}%)`);

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

  await playTurns(page, [
    "Hello! What do you keep in those ledgers?",
    "I'm Nico. Does the silver really stay in Spain?",
    "I work far from here. Who owns the mine, really?",
    "I want to understand why Spain stayed poor.",
    "Where did all the silver really go?",
    "Thanks.",
  ]);
  await page.waitForSelector("#scene-back", { timeout: 30_000 });
  const text = await hudText(page);
  const full = await page.evaluate<boolean>(`(() => {
    const ms = [...document.querySelectorAll("[data-testid='conversation-panel'] [role='img']")];
    return ms.length > 0 && ms.every((m) => /llen|compl|full/i.test(m.getAttribute("aria-label") || ""));
  })()`);
  await shot(page, "ac16-factor-leche");
  check("AC16", text.includes("The milk was never ours") && full, `linea de la leche ${text.includes("The milk was never ours")}, medidores llenos ${full}`);
}

async function walkCampesino(page: Page, url: string): Promise<void> {
  await page.goto(`${url}/?voz=0`);
  await enterWorld(page);
  const stats = await canvasStats(page);
  await shot(page, "ac17-campesino");
  const name = await walkToNpc(page, "NPC-INES");
  check("AC17", isNonUniform(stats), `colores ${stats.distinct}, dominante ${(stats.dominantShare * 100).toFixed(1)}%, aviso con "${name}"`);
}

/** Abre el navegador para una caminata; el finally lo cierra pase lo que pase. */
async function withBrowser(exe: string, run: (page: Page) => Promise<void>, failOnPurpose: boolean): Promise<void> {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  try {
    browser = await chromium.launch({
      executablePath: exe,
      headless: process.env["LG_WALK_HEADED"] !== "1",
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"],
    });
    live = { browser, context: null };
    context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    live = { browser, context };
    const page = await context.newPage();
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
    if (failOnPurpose) throw new Error("--fail-on-purpose: falla deliberada con el navegador abierto");
    try {
      await run(page);
    } catch (e) {
      await page.screenshot({ path: join(SHOTS_DIR, "fallo.png") }).catch(() => undefined);
      throw e;
    }
    check("console", errors.length === 0, errors.length === 0 ? "cero console.error" : errors.slice(0, 3).join(" | "));
  } finally {
    await closeBrowser(context, browser);
    live = { browser: null, context: null };
    console.log("[walk] navegador cerrado");
  }
}

async function main(): Promise<void> {
  const failOnPurpose = process.argv.includes("--fail-on-purpose") || process.env["LG_WALK_FAIL"] === "1";
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
    void closeBrowser(live.context, live.browser).finally(() => { stack?.stop(); process.exit(130); });
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    stack = await startStack(UNIVERSE);
    await withBrowser(exe, (page) => walkUniverse(page, stack?.url ?? ""), failOnPurpose);
    stack.stop();
    stack = await startStack(null);
    await withBrowser(exe, (page) => walkCampesino(page, stack?.url ?? ""), failOnPurpose);
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
