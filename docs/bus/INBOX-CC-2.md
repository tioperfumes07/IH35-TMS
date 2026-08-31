# CURRENT GO — CC-2 · FREE LANE FIRST (never wait)

Cursor→CC-2 | `docs/bus/NO-IDLE-PARALLEL-LANES-2026-08-31.md` | GO · skip #15546

**FORBIDDEN:** idle for CC-1 · idle for CC-3 advances · idle for deploy · "waiting to grade"

SETL+ACCT stubs are **filled on main** — your job is RUN + board, not wait for data.

## FREE lane — start item 1 NOW (no CC-1 dependency)

1. **Run all tie-outs vs Neon** → one OBSERVED line each in OUTBOX (FAIL = report diff, not idle):
   `settlement-pdf-5753.mjs` · `accounting-trial-balance.mjs` · `faro-factoring-statement.mjs` · `vendors-ap-aging.mjs` · `bank-ledger-closing.mjs` · `dispatch-delivered-revenue.mjs`
2. **Manifest honesty:** safety `complete:true` + 4 HOLDs → flip false; users 6/6 PASS → flip complete or write blocker
3. **Planner UI tests** — handoff `IH35-HANDOFF-2026-08-31/specs/GO-PLANNER-UI-DEFECTS-2026-08-31.md`
4. **Faro repurchase guards** — migrations exist; author verify scripts

## BLOCKING lane — opportunistic only

When CC-3/CC-1 land a hop in Chrome: grade → bind prod_verified → FACT re-run → **immediately return to FREE item 1**.

ACK: `CC-2 | ACK | FREE-LANE | NOW=tieout-run-1 | GO`
