// F4.2: pure rules of the dialogue HUD. Per-build glossary (D-131, 03 §8.3), tappable words (D-068) and the hint
// chip adjustment (D-035).
import { describe, expect, test } from "vitest";
import {
  applySettingsPatch, DEFAULT_SETTINGS, glossaryKey, glossaryVisibility, HINT_CHIP_DELAY_MS, isGlossaryDisplay,
  persistableSettings, plainTemplateText, tokenizeLine,
} from "../src/index";

describe("glossaryVisibility (D-131)", () => {
  test("dev: approved sin marca; reviewed y draft con marca borrador", () => {
    expect(glossaryVisibility("approved", "dev")).toBe("shown");
    expect(glossaryVisibility("reviewed", "dev")).toBe("draftMark");
    expect(glossaryVisibility("draft", "dev")).toBe("draftMark");
  });
  test("release: solo approved", () => {
    expect(glossaryVisibility("approved", "release")).toBe("shown");
    expect(glossaryVisibility("reviewed", "release")).toBe("hidden");
    expect(glossaryVisibility("draft", "release")).toBe("hidden");
  });
  test("fv: approved + reviewed, nunca draft (D-128)", () => {
    expect(glossaryVisibility("approved", "fv")).toBe("shown");
    expect(glossaryVisibility("reviewed", "fv")).toBe("shown");
    expect(glossaryVisibility("draft", "fv")).toBe("hidden");
  });
  test("isGlossaryDisplay", () => {
    expect(["dev", "release", "fv", "prod", null].map(isGlossaryDisplay)).toEqual([true, true, true, false, false]);
  });
});

describe("palabras tocables", () => {
  test("tokenizeLine no pierde texto y marca solo palabras", () => {
    const line = "Hello! I’m Inés — welcome, well-known friend.";
    const tokens = tokenizeLine(line);
    expect(tokens.map((t) => t.text).join("")).toBe(line);
    expect(tokens.filter((t) => t.key).map((t) => t.key)).toEqual(["hello", "i'm", "inés", "welcome", "well-known", "friend"]);
    expect(tokenizeLine("")).toEqual([]);
    expect(tokenizeLine("...")).toEqual([{ text: "...", key: null }]);
  });
  test("glossaryKey normaliza mayúsculas, apóstrofo y puntuación", () => {
    expect(glossaryKey("Field,")).toBe("field");
    expect(glossaryKey("“What’s")).toBe("what's");
  });
  test("plainTemplateText saca el marcado de inglés modelado y los huecos sin valor", () => {
    expect(plainTemplateText("***Corn.*** Maíz. Hola, {nombre}.")).toBe("Corn. Maíz. Hola, ….");
  });
});

describe("ajuste del chip de pista (D-035)", () => {
  test("encendido por defecto, 10 s, desactivable y se guarda", () => {
    expect(DEFAULT_SETTINGS.input.hintChip).toBe(true);
    expect(HINT_CHIP_DELAY_MS).toBe(10_000);
    const off = applySettingsPatch(DEFAULT_SETTINGS, { input: { hintChip: false } });
    expect(off.input.hintChip).toBe(false);
    expect(applySettingsPatch(off, { input: { hintChip: "yes" as unknown as boolean } }).input.hintChip).toBe(false);
    expect(persistableSettings(off).input?.hintChip).toBe(false);
  });
});
