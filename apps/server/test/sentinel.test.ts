import { expect, test } from "vitest";
import { SERVICE_NAME } from "../src/index";

// Centinela de F1.1a: el workspace existe, compila y vitest lo recolecta.
test("@lg/server sentinel", () => {
  expect(SERVICE_NAME).toBe("@lg/server");
});
