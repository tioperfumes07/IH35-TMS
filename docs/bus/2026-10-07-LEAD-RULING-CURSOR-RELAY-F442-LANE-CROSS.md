# LEAD RULING — Cursor RELAY-F442 sender fee lane cross (2026-10-07)

Owner packet `~/Downloads/10-07-2026-ALL-SEATS-RELAY-P0-FEED-DEAD-FUEL-ITEMS-DROPPED-FEE-MISSING.md`
§ WHO TAKES WHAT:

> F440 is the blocker — nothing to match while the feed is dead. One seat takes F440 alone, now.
> F441 + F442 belong together (same parse, same money) and can run in parallel on a second seat.

CC-1 owns F440 (`~/Downloads/10-07-2026-CC-1-RELAY-F440-FEED-DEAD-FIX-NOW.md`). Cursor takes
F441+F442 in parallel. This PR is F442 only (F441 typed lines already on tip).

LANE_CROSS authorized for this PR only into files mapped CC-1 / CC-3 / UNASSIGNED that F442 must
touch to finish the fee end-to-end:

- `apps/backend/src/accounting/bank-recon/bank-match-fuel-post.service.ts` (+ test) — postRelayFuelFill fee_amount_cents
- `apps/backend/src/accounting/fuel-posting/poster.service.ts` — Fuel Card Fee debit leg
- `apps/backend/src/driver-finance/settlement-creator.service.ts` — fee_amount separate from total_cost
- `apps/backend/src/integrations/relay-payments/*` — ingest wallet drawdown = paid + fee; helper
- `scripts/verify-relay-f442-sender-fee.mjs` + piggyback EVEN `12375-verify-relay-wallet-bank-feed.mjs`
- `.pr-body-relay-f442.md`

No new GL math invented — ROUND 192 createExpenseFromFuelTransaction already emits the fee line
when fee_amount > 0; this PR wires the missing cents through. No Book Load POST. USMCA only.
No baseline grow.

Authority: owner ALL-SEATS Relay P0 packet 2026-10-07 + EACH-SEAT-BUILDS-ITS-ENGINE-END-TO-END.
Cite: `LANE_CROSS=2026-10-07-LEAD-RULING-CURSOR-RELAY-F442-LANE-CROSS.md`
