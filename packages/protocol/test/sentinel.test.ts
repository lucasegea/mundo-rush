import { expect, test } from "vitest";
import { PACKAGE_NAME } from "../src/index";

// Centinela de F1.1a: el workspace existe, compila y vitest lo recolecta.
test("@lg/protocol sentinel", () => {
  expect(PACKAGE_NAME).toBe("@lg/protocol");
});
