import { expect, test } from "vitest";
import { PACKAGE_NAME } from "../src/index";

// Centinela de M2: el paquete @lg/art existe, compila y vitest lo recolecta.
test("@lg/art sentinel", () => {
  expect(PACKAGE_NAME).toBe("@lg/art");
});
