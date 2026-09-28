# LANE-CROSS RULING — Devin-A CI Fix: Toast Calls (2026-09-28)

## Scope

Devin-A (RETIRED seat, reassigned by Lead) is authorized to touch the following
files outside its normal lane to fix the CI typecheck failure on main:

- `apps/frontend/src/pages/accounting/checks/CheckDetailPage.tsx`
- `apps/frontend/src/pages/accounting/checks/CheckPrintPage.tsx`
- `scripts/.load-settlement-linkage-orphan-baseline.json`
- `scripts/.load-settlement-linkage-misattached-baseline.json`

## Reason

CI on main is RED (build-typecheck + build-typecheck-heavy fail with 5 TS2345
errors). The check pages (PR #23040 R-191) call `pushToast` with `{ kind, message }`
objects but the Toast API signature is `pushToast(message: string, variant?)`.
This blocks all PRs. The Post-Deploy Verify also fails on
`verify-load-settlement-linkage` (15 orphans vs baseline 3, 5 misattached vs
baseline 2) — pre-existing data drift that needs the baseline raised.

## Authority

Lead ruling (Claude-Lead, 2026-09-28). Devin-A was instructed to check Render
deployments and fix failures.
