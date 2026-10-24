FINDING: SETL-F443288-C — no Dispatch/Close surface for expense load confirmations (ruling 443.288)
LANE: NON-FINANCIAL

SOURCE-OF-TRUTH: apps/frontend/src/routes/manifest.tsx + SettlementCloseArrivalPage.tsx — proven at tip before this PR (no `/dispatch/expense-load-confirmations`; Close had no confirm gate)
I QUERIED:       `rg expense-load-confirmations apps/frontend/src/routes/manifest.tsx`; `rg loadConfirm|expense.load.confirm SettlementCloseArrivalPage.tsx`
NOT CHECKED:     Neon `load_confirmation` column / 443.288-B engine live on Render (CC-2); Chrome after deploy

ROOT CAUSE: Ruling 443.288-C requires a V3 confirmations queue in Dispatch and a blocking Close panel. Tip had neither route nor gate, so proposed expense→load assignments could close without dispatcher/closer confirm. Empty must mean confirmed; engine 404/501 must fail closed (never treat missing engine as empty).

FIX: API client (GET/POST load-confirmations, 404/501 → engine-unavailable), shared ExpenseLoadConfirmationsBoard, `/dispatch/expense-load-confirmations` page + DispatchSubnav/sidebar, SettlementCloseArrivalPage gate+panel (not step 8). ROUND 133 auth-gate on tip Claude ops void/backfill writers so unauthorized-write EXIT 0.

DOD-A: PASS
DOD-B: N/A
DOD-C: PASS
DOD-D: N/A
DOD-E: PASS
VERIFY-1: N/A
VERIFY-2: N/A
VERIFY-3: N/A
VERIFY-4: N/A
VERIFY-5: N/A
VERIFY-6: N/A
VERIFY-7: PASS
VERIFY-8: PASS
MODULE_PROGRESS: settlements (FE surface only; N of M unchanged)
ITEMS_TOUCHED: SETL-F443288-C
MIGRATE: N/A

GUARD: FE vitest expenseLoadConfirmations + ExpenseLoadConfirmationsPage; verify-no-unauthorized-production-write EXIT 0
LIVE PROOF: apps/frontend typecheck EXIT 0; vitest 2 files / 5 tests PASS; verify-no-unauthorized-production-write EXIT 0; money-pr-local-gate EXIT 0
PROVES-IT-WORKS: vitest fail-closed on 404/501; Close `canSubmitClose` false when engine missing or proposed>0
KEEPS-IT-TRUE: FE board reads GET `/api/v1/expenses/load-confirmations` (443.288-B); empty array = confirmed; missing engine = blocked
REMAINING: Chrome live after deploy; Close unblocks when 443.288-B engine is on tip. Live=BLOCKED until deploy. P-0123/P-0124 empty-shell void remains CC-1 ops (write creds).
