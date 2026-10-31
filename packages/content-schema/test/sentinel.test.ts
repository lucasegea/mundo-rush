import { expect, test } from "vitest";
import { PACKAGE_NAME } from "../src/index";

// F1.1a sentinel: the workspace exists, compiles and vitest collects it.
test("@lg/content-schema sentinel", () => {
  expect(PACKAGE_NAME).toBe("@lg/content-schema");
});
