import { expect, test } from "vitest";
import { SERVICE_NAME } from "../src/index";

// F1.1a sentinel: the workspace exists, compiles and vitest collects it.
test("@lg/server sentinel", () => {
  expect(SERVICE_NAME).toBe("@lg/server");
});
