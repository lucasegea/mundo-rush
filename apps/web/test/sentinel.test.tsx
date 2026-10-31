import { expect, test } from "vitest";
import { App } from "../src/App";

// F1.1a sentinel: the workspace exists, compiles and vitest collects it. Since F1.3 App mounts the shell
// (the walkthroughs are in shell.test.tsx and dialog-only.test.tsx).
test("@lg/web sentinel", () => {
  expect(typeof App).toBe("function");
});
