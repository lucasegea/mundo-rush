// world/frameRate.ts — the canvas frame cap (plan estetica-c M6, 03 §2.7.1 and §2.7.4), in pure functions so they can
// be tested without GPU: with a conversation scene on top the canvas draws at 30 FPS at most (frees CPU for
// audio and the WebSocket); outside the chat the tier's `targetFps` rules. FrameRegulator.tsx applies them every browser
// frame. While the chat cap lasts, performance is not measured: if PerformanceMonitor saw those 30 FPS it would
// take them for a drop and lower the tier because of a limit of its own.
//
// Deadline clock: each drawn frame advances the deadline by an exact interval (1000 / cap), so in any window at most
// the deadlines that expired plus one are drawn (the cap is never exceeded on average) and the phase does not drift on
// displays whose period does not divide the interval (75 or 144 Hz). If the browser stalled and the deadline fell behind, it
// resynchronizes instead of drawing a burst to catch up.

/** Margin against requestAnimationFrame jitter: at 60 Hz with a 60 cap no frame is skipped. */
export const FRAME_SLACK_MS = 2;

/** The cap that rules: the lesser of the chat's and the tier's (null = no cap). */
export function frameCap(conversationFps: number | null, tierFps: number | null): number | null {
  const caps = [conversationFps, tierFps].filter((x): x is number => x !== null && Number.isFinite(x) && x > 0);
  return caps.length > 0 ? Math.min(...caps) : null;
}

/** Is it time to draw? `now` and `deadline` in ms of the same clock (the next frame's deadline). */
export const frameDue = (now: number, deadline: number): boolean => now >= deadline - FRAME_SLACK_MS;

/**
 * The next deadline after drawing at `now`: one interval after the previous one; if that would land in the past (the
 * browser stalled for more than an interval), one interval after now.
 */
export function nextDeadline(deadline: number, now: number, maxFps: number): number {
  const interval = 1000 / maxFps;
  const next = deadline + interval;
  return next <= now ? now + interval : next;
}

/** PerformanceMonitor measures only outside the chat cap (it never lowers or raises the tier while talking, §2.7.2.2). */
export const monitorActive = (conversationFps: number | null): boolean => conversationFps === null;

/** drei PerformanceMonitor's default bounds (the ones used when no cap bites). */
export const DREI_DEFAULT_BOUNDS = (refreshrate: number): [number, number] => (refreshrate > 100 ? [60, 100] : [40, 60]);

/**
 * PerformanceMonitor bounds according to the frame cap (QA's note 2 in M6). drei declines when the average drops
 * below `lower`, and its `refreshrate` is the maximum FPS it measured, which with a cap is the cap itself: with the default
 * bounds a 30 cap gives [40, 60] and the monitor would take its own cap for a drop every ~2.5 s. With a cap, the bounds
 * come from the cap (not from what was measured, so a PC that does not reach the cap keeps declining) with the 60 Hz default's
 * proportion: 2/3 down, the cap up. At 30 FPS, [20, 30]; at 60, [40, 60] (the default). Without a cap, drei's default.
 */
export function monitorBounds(cap: number | null): (refreshrate: number) => [number, number] {
  return (refreshrate) => (cap === null ? DREI_DEFAULT_BOUNDS(refreshrate) : [(cap * 2) / 3, cap]);
}

/** What the canvas does with the frame loop: R3F mode, regulator cap and PerformanceMonitor. */
export interface CanvasLoop {
  /** "demand" with a pausing panel or with a cap (the regulator requests the frames); "always" without a cap. */
  frameloop: "always" | "demand";
  /** Cap that FrameRegulator applies; null = not mounted (paused or uncapped). */
  regulatorFps: number | null;
  /** PerformanceMonitor with its bounds; null = not mounted (during the chat). */
  monitor: { bounds: (refreshrate: number) => [number, number] } | null;
}

/**
 * The canvas frame loop as a pure function (QA's note 1 in M6): GameCanvas only applies what this returns,
 * so a change that mounts the monitor in the chat or leaves the canvas on "always" with a cap breaks a test.
 */
export function canvasLoop(render: { paused: boolean; conversationFps: number | null }, tierFps: number | null, uncapped = false): CanvasLoop {
  // open-world-3d T2(g), D-833: the performance probe (development only) measures uncapped: "always" and no regulator.
  const cap = uncapped ? null : frameCap(render.conversationFps, tierFps);
  return {
    frameloop: render.paused || cap !== null ? "demand" : "always",
    regulatorFps: !render.paused && cap !== null ? cap : null,
    monitor: monitorActive(render.conversationFps) ? { bounds: monitorBounds(cap) } : null,
  };
}

/**
 * Frames drawn in `durationMs` with a `displayHz` screen and a `maxFps` cap (regulator simulation, for
 * the tests and to reason about the margin). `jitterMs(i)` shifts the browser's i-th frame.
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
