import { expect, test } from "vitest";
import { PACKAGE_NAME } from "../src/index";

// F1.1a sentinel: the workspace exists, compiles and vitest collects it.
test("@lg/protocol sentinel", () => {
  expect(PACKAGE_NAME).toBe("@lg/protocol");
});
