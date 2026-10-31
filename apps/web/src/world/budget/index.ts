// world/budget/ — static estimator of draw calls and triangles (plan estetica-c M1 A15) and texture memory per tier
// (M6). Zone marker. renderStats.ts (renderer.info counters, development only) is NOT re-exported here: it is loaded
// via import() under the director mode's double key, so it never enters a build.
export * from "./estimate";
export * from "./textures";
