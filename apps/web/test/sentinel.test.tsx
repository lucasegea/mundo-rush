import { expect, test } from "vitest";
import { App } from "../src/App";

// Centinela de F1.1a: el workspace existe, compila y vitest lo recolecta. Desde F1.3 App monta el shell
// (los recorridos están en shell.test.tsx y dialog-only.test.tsx).
test("@lg/web sentinel", () => {
  expect(typeof App).toBe("function");
});
