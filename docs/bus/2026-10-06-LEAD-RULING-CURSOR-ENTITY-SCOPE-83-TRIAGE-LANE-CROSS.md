# LEAD RULING — CURSOR entity-scope 83 triage (verify-mdata-entity-scope ratchet)

2026-10-06 · Cursor Lead · authorizes `LANE_CROSS` for branch `cursor/entity-scope-83-triage-c89b`

## Finding

`node scripts/verify-steps/84-verify-mdata-entity-scope.mjs` failed on tip with **83 new** SQL template
literals touching `mdata.{loads,drivers,customers,units,equipment}` or `catalogs.{accounts,classes}`
without an inline company predicate. Owner law: RLS does **not** protect Owner sessions — each query's
own filter is the safeguard.

CC-2 started this triage; Cursor finishes it as a single vertical slice (fix leaks + baseline safe helpers).

## Scope crossed (16 files)

**REAL_LEAK fixes (15 backend paths):**

- `apps/backend/src/accounting/company-settlement-report.service.ts`
- `apps/backend/src/accounting/driver-subaccount-provision.service.ts`
- `apps/backend/src/accounting/owned-unit-fixed-asset-register.service.ts`
- `apps/backend/src/accounting/posted-while-tour-open-report.service.ts`
- `apps/backend/src/dispatch/driver-pwa/dispatch-view.routes.ts`
- `apps/backend/src/dispatch/presettlement-link.service.ts`
- `apps/backend/src/dispatch/trailer-interchange.routes.ts`
- `apps/backend/src/docs/maybe-fire-auto-invoice-after-bol.ts`
- `apps/backend/src/driver-finance/settlement-creator.service.ts`
- `apps/backend/src/driver-finance/weekly-close.routes.ts`
- `apps/backend/src/feed/ensure-settlement-from-fed-bills.service.ts`
- `apps/backend/src/integrations/samsara/messaging/driver-prompts.service.ts`
- `apps/backend/src/maintenance/driver-integrity-profile.service.ts`
- `apps/backend/src/mdata/driver-merge.service.ts`
- `apps/backend/src/telematics/stop-events.reads.ts`

**Guard baseline (CC-1 verify-steps lane):**

- `scripts/verify-steps/84-verify-mdata-entity-scope.baseline.json`

## Classification (83 literals)

| Bucket | Count | Action |
|--------|------:|--------|
| REAL_LEAK | 17 | Explicit `operating_company_id` / owner-or-leased predicate added |
| SAFE_HELPER | 48 | Baselined — scope via interpolated helper the ratchet cannot see |
| SAFE_PK | 18 | Baselined — self-read by validated PK after company-validated parent |

## Gate

Run money-pr-local-gate / push with:

`LANE_CROSS=2026-10-06-LEAD-RULING-CURSOR-ENTITY-SCOPE-83-TRIAGE-LANE-CROSS.md`

Name the same file in the PR body under `LANE_CROSS:`.

## Proof target

`node scripts/verify-steps/84-verify-mdata-entity-scope.mjs` exit 0:

`verify-mdata-entity-scope OK — 114 unscoped literals, all allowlisted (114 baseline entries).`
