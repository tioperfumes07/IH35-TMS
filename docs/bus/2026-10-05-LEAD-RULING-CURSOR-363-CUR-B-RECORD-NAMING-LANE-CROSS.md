# LEAD RULING — CURSOR 363-CUR-B record-naming click-through, lane cross

2026-10-05 · Cursor Lead · authorizes LANE_CROSS for this filename

## Scope (branch `cursor/bank-363-cur-b-clickthrough-c89b` only)

ROUND 363-CUR-B (`docs/bus/10-03-2026-CURSOR-ROUND-363-CLEARED-UNCLEARED-EVERYWHERE-AND-THE-CLICK-THROUGH-SWEEP.md`)
assigns Cursor the app-wide record-naming click-through sweep. Claim **12416** is on tip (#25456).
This PR may touch:

- `scripts/verify-record-naming-cells-are-click-through.mjs` — new guard (EVEN 12416, Cursor band)
- `scripts/verify-steps/12416-verify-record-naming-cells-are-click-through.mjs` — verify-step wrapper
- `scripts/verify-no-money-theater.mjs` — narrow ROUND 363-CUR-B exemption only (guard-backed
  frontend EntityLink sweep is not Rule-23 theater; selftest arms included)
- `scripts/entity-link-adoption-baseline.json` — intentional regen after wiring EntityLink on 11 surfaces
- `apps/backend/src/accounting/payment-void-stamp.service.ts` — ROUND 368.2(b) one-writer hole:
  stampCustomerPaymentVoided must release matched_payment_id bank lines BEFORE voided_at. Tip rot
  from AUTH-400 blocked 363-CUR-B ship; the release lives in the one stamp so every door (route,
  bulk-void, executor, voidDocument) is whole. No new GL math.

## Why

363-CUR-B is Cursor's INBOX row (deadline 2026-10-06 06:00Z). The guard and EVEN verify-step were
claimed on tip before author (Rule 37). CC-1 owns `scripts/verify-*.mjs` generically, but the
owner order and bus file name Cursor as the sweep seat; blocking the guard author on lane alone would
stall the only seat assigned this work. Frontend paths remain SHARED (`apps/frontend/**`).

## Gate

Run money-pr-local-gate with:

`LANE_CROSS=2026-10-05-LEAD-RULING-CURSOR-363-CUR-B-RECORD-NAMING-LANE-CROSS.md`

Name the same file in the PR body under `LANE_CROSS:`.
