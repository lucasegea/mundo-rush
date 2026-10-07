import { expect, test } from "vitest";
import { App } from "../src/App";

// Centinela de F1.1a: el workspace existe, compila y vitest lo recolecta.
test("@lg/web sentinel", () => {
  expect(App()).toBeNull();
});
