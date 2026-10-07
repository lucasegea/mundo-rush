import { describe, expect, it } from "vitest";
import { classifyWeights, computeFrameStats, formatBytes, FrameSampler, loadTimeSeconds } from "../src/lib/metrics";

describe("overlay metrics", () => {
  it("computes FPS from the mean and p95 by nearest rank", () => {
    const times = [...Array(95).fill(16), ...Array(5).fill(50)];
    const s = computeFrameStats(times);
    expect(s.samples).toBe(100);
    expect(s.avgMs).toBeCloseTo(17.7);
    expect(s.fps).toBeCloseTo(1000 / 17.7);
    expect(s.p95Ms).toBe(16); // rank 95 of 100 is still a 16 ms frame
    expect(computeFrameStats([...times, 50]).p95Ms).toBe(50); // rank 96 of 101 hits the slow tail
  });

  it("ignores invalid samples and returns zeros when empty", () => {
    expect(computeFrameStats([])).toEqual({ fps: 0, avgMs: 0, p95Ms: 0, samples: 0 });
    expect(computeFrameStats([0, -1, Number.NaN, 20]).fps).toBeCloseTo(50);
  });

  it("keeps only the last N frames in the sampler", () => {
    const s = new FrameSampler(3);
    [10, 20, 30, 40].forEach((t) => s.push(t));
    expect(s.values().sort()).toEqual([20, 30, 40]);
    s.reset();
    expect(s.values()).toEqual([]);
  });

  it("reports load time in seconds from navigation start", () => {
    expect(loadTimeSeconds(null)).toBeNull();
    expect(loadTimeSeconds(2500)).toBe(2.5);
    expect(loadTimeSeconds(1000, 1500)).toBe(0);
  });

  it("classifies weights into JS, textures and GLB", () => {
    const w = classifyWeights(
      [
        { name: "http://h/assets/index-abc.js?v=1", bytes: 1000 },
        { name: "http://h/assets/index.css", bytes: 100 },
        { name: "http://h/textures/atlas.png", bytes: 300 },
        { name: "http://h/models/house.glb", bytes: 400 },
        { name: "http://h/data.json", bytes: 50 },
      ],
      64,
    );
    expect(w).toEqual({ jsBytes: 1100, textureBytes: 364, glbBytes: 400, totalBytes: 1914 });
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.00 MB");
  });
});
