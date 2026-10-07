// Guardia de coverage:core: si los globs de coverage.include no matchean nada, vitest mide
// 0/0 líneas y el umbral del 90 % pasa igual (falso verde visto en F1.1b). Esto lo corta.
import { readFileSync } from "node:fs";

const SUMMARY = "coverage/core/coverage-summary.json";
const summary = JSON.parse(readFileSync(SUMMARY, "utf8")) as { total: { lines: { total: number } } };
const measured = summary.total.lines.total;
if (measured > 0) {
  console.log(`coverage:core: ${measured} líneas medidas`);
} else {
  console.error(`coverage:core: 0 líneas medidas en ${SUMMARY}; revisá coverage.include en vitest.config.ts`);
  process.exitCode = 1;
}
