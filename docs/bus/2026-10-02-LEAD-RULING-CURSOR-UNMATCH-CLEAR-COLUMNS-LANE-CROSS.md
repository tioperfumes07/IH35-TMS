# LEAD RULING — CURSOR unmatch clear columns + match-created JE reverse only, lane cross

2026-10-02 · Cursor Lead · authorizes LANE_CROSS for this filename

## Why

Owner order `docs/bus/00-OWNER-ORDER-2026-10-02-ALL-CODERS-BUILD-100-PERCENT-NO-HANDOFF.md` §4
CURSOR:

> `unmatchBankTransaction` itself leaves `matched_invoice_id`, `matched_advance_id` and
> `categorization_gl_account_id` set, and reverses a journal entry it did not create.

Bank-match writer is Cursor's engine. The one unmatch writer lives in
`apps/backend/src/accounting/bank-recon/recon-worklist.service.ts` (and void cascade twin
`BANK_TX_UNMATCH_RESET_SQL` in `void.service.ts`). LANES.md maps those under accounting/money
(CC-1). Standing EACH-SEAT-BUILDS-ITS-ENGINE-END-TO-END — no handoff.

## Scope (this PR only)

- `apps/backend/src/accounting/bank-recon/recon-worklist.service.ts` — clear the three columns;
  reverse JE only when prior fuel/relay/factoring match (match-created posting)
- `apps/backend/src/accounting/void.service.ts` — `BANK_TX_UNMATCH_RESET_SQL` also clears
  `matched_invoice_id` + `matched_advance_id` (already cleared categorization_gl_account_id)
- `scripts/verify-one-bank-match-writer-writes-je.mjs` — assert the three clears + matchCreatedJe gate

No seed/match/Chrome. No new GL math.

## Cite

`LANE_CROSS=2026-10-02-LEAD-RULING-CURSOR-UNMATCH-CLEAR-COLUMNS-LANE-CROSS.md`
