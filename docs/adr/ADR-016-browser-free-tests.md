# ADR-016 — Browser-free tests

- **Status:** Proposed (D-088: contract until the operator decides) · amended (P0)
- **Date:** 2026-10-06 (decision, `03` §11) · copied to `docs/adr/` on 2026-10-07 (F1.1b)
- **Source:** `docs/03-architecture.md` §11 (status in the `03` table: Proposed)

## Decision

Browser-free tests: vitest (+ jsdom and the R3F test-renderer), tsc, lint, validators and budgets; evaluation with real models only manual (§8)

## Rejected alternatives

Playwright/browser E2E (forbidden by the operator)

## Trade-offs

Automatic detection of visual regressions

## Amended (P0)

Amendment of the "how" from `docs/reports/P0-2026-10-06.md` §1, accepted by the default of D-196. It does not change the decision.

(a) "CI" = local `npm run verify` (there is no CI server). (b) Worklet DSP (VAD, OLA, resample) is written as pure functions in separate modules; the `AudioWorkletProcessor` is a logic-free shell (jsdom has no `AudioWorkletGlobalScope`). (c) The lint is tested with the ESLint API (`lintText` with a virtual `filePath`) or with fixtures outside the root lint.

## How to change

A change to this decision enters as a new ADR with the next number (D-088); this file is not rewritten.
