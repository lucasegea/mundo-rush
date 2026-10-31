// i18n (ADR-019, D-045): typed keys, missing-keys test, plurals and voseo.
import { describe, expect, test } from "vitest";
import { FEEDBACK_MODES, NPC_SPEEDS, SELECTABLE_TIERS, TEXT_SCALES } from "@lg/core";
import { CATALOGS, isMessageKey, t, tDynamic } from "../src/i18n";
import { createActions } from "../src/state/actions";
import { createGameStore } from "../src/state/store";

const catalog = CATALOGS["es-AR"];
const SOURCES = import.meta.glob("../src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

describe("claves faltantes", () => {
  test("hay fuentes para revisar (guardia contra 0 medido)", () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(20);
  });

  test("toda clave literal de t(\"…\") en src/ existe en el catálogo", () => {
    const missing: string[] = [];
    for (const [file, code] of Object.entries(SOURCES)) {
      if (file.includes("/i18n/")) continue; // the helper documents t("…") in comments
      for (const m of code.matchAll(/\bt\("([^"]+)"/g)) if (!isMessageKey(m[1] ?? "")) missing.push(`${file}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });

  test("las claves dinámicas `prefijo.${valor}` existen para cada valor posible", () => {
    const dynamic = [
      ...NPC_SPEEDS.map((v) => `settings.npcSpeed.${v}`),
      ...FEEDBACK_MODES.map((v) => `settings.feedbackMode.${v}`),
      ...["auto", ...SELECTABLE_TIERS].map((v) => `settings.tier.${v}`),
    ];
    expect(dynamic.filter((k) => !isMessageKey(k))).toEqual([]);
  });

  test("todo anuncio que emiten las acciones tiene clave (y claves-parámetro) en el catálogo", () => {
    const store = createGameStore();
    const a = createActions(store);
    const keys = new Set<string>();
    const record = () => {
      const ann = store.getState().ui.announcement;
      if (ann) { keys.add(ann.key); for (const k of Object.values(ann.keyParams)) keys.add(k); }
    };
    const run = (fn: () => void) => { fn(); record(); };
    run(() => a.bootCompleted({ webgl2: true, deviceMemoryGb: 8, cores: 8 }));
    run(() => a.bootCompleted({ webgl2: false, deviceMemoryGb: null, cores: null }));
    run(() => { a.setTierChoice("dialog-only"); a.bootCompleted({ webgl2: true, deviceMemoryGb: 8, cores: 8 }); });
    for (const s of TEXT_SCALES) run(() => a.setTextScale(s));
    for (const on of [true, false]) { run(() => a.setHighContrast(on)); run(() => a.setReduceMotion(on)); run(() => a.setSubtitles(on)); }
    for (const v of NPC_SPEEDS) run(() => a.setNpcSpeed(v));
    for (const v of FEEDBACK_MODES) run(() => a.setFeedbackMode(v));
    for (const v of ["auto", ...SELECTABLE_TIERS] as const) run(() => a.setTierChoice(v));
    run(() => a.enterDialogOnly());
    run(() => a.enterWorld());
    run(() => { a.setTierChoice("low"); a.bootCompleted({ webgl2: true, deviceMemoryGb: 8, cores: 8 }); a.enterWorld(); });
    run(() => a.contentFailed());
    keys.add("announce.storageUnavailable"); // emitted by boot/ (persistence)
    expect([...keys].filter((k) => !isMessageKey(k))).toEqual([]);
    expect(keys.size).toBeGreaterThan(15);
  });
});

describe("t", () => {
  test("interpola y elige plural con Intl.PluralRules", () => {
    expect(t("dialogOnly.enterScene", { name: "Kofi" })).toBe("Hablar con Kofi");
    expect(t("dialogOnly.people", { count: 1 })).toBe("1 persona");
    expect(t("dialogOnly.people", { count: 3 })).toBe("3 personas");
    expect(tDynamic("announce.npcSpeed", {}, { value: "settings.npcSpeed.slowest" })).toBe("Velocidad de los vecinos: Muy lenta.");
  });

  test("una clave dinámica inexistente se ve tal cual (falla visible, no texto vacío)", () => {
    expect(tDynamic("no.existe")).toBe("no.existe");
  });

  test("todo plural tiene forma `other`", () => {
    for (const [k, v] of Object.entries(catalog)) if (typeof v !== "string") expect(v.other, k).toBeTypeOf("string");
  });
});

describe("D-045: rioplatense con voseo", () => {
  // "Tuteo" forms and "usted" forms that do not belong in the interface (voseo).
  const TUTEO = /\b(tú|puedes|tienes|quieres|eres|elige|entra|prueba|usa|vuelve|recarga|estás seguro de que)\b/i;
  test("ninguna cadena tutea", () => {
    const texts = Object.values(catalog).flatMap((v) => (typeof v === "string" ? [v] : Object.values(v)));
    expect(texts.filter((s) => s !== undefined && TUTEO.test(s))).toEqual([]);
  });
  test("las cadenas con imperativo usan voseo", () => {
    expect(t("dialogOnly.intro")).toMatch(/^Elegí .* entrá /);
    expect(t("menu.hint")).toMatch(/^Usá /);
  });
});
