// J-3 (2026-10-30): dev:play gives the client the same universe as the server, so a URL without ?universe= plays it.
import { describe, expect, test } from "vitest";
import { playEnv } from "./play.ts";

describe("playEnv", () => {
  test("with a universe: LG_UNIVERSE for the server and VITE_LG_UNIVERSE for the client", () => {
    expect(playEnv({}, "U-GALEANO")).toMatchObject({ LG_OPERATOR_MODE: "1", LG_UNIVERSE: "U-GALEANO", VITE_LG_UNIVERSE: "U-GALEANO" });
  });

  test("without a universe: neither variable", () => {
    const env = playEnv({});
    expect(env).not.toHaveProperty("LG_UNIVERSE");
    expect(env).not.toHaveProperty("VITE_LG_UNIVERSE");
  });
});
