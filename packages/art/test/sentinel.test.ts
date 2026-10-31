import { expect, test } from "vitest";
import { PACKAGE_NAME } from "../src/index";

// M2 sentinel: the @lg/art package exists, compiles and vitest collects it.
test("@lg/art sentinel", () => {
  expect(PACKAGE_NAME).toBe("@lg/art");
});
