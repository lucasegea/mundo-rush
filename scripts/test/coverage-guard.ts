// coverage:core guard: if the coverage.include globs match nothing, vitest measures
// 0/0 lines and the 90 % threshold passes anyway (false green seen in F1.1b). This cuts it off.
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
