# LEAD RULING — CURSOR ROUND 443.29 Part B (Relay deposit bank match), lane cross into CC-1 / CC-2 banking

2026-10-10 · Claude Lead · authorizes `LANE_CROSS` for this filename

## Why

`docs/bus/2026-10-10-LEAD-ROUND-443-ORDERS.md` — **ROUND 443.29, PART B — CURSOR** (deadline 03:30 UTC):

Banking match offers `integrations.relay_deposits` as a match candidate (charged = wallet + 3.25% fee), shows wallet/fee split before confirm, read-only list for ~1,291 legacy categorized wallet outflows. Guard: `verify-relay-deposit-is-a-bank-match-candidate.mjs`.

Lane boundary in the order: Cursor does **not** touch `integrations/relay-payments/**` (CC-2) or `driver-finance/**` (CC-3). Banking + bank-recon match wiring is Cursor for this round.

## Scope (PR `cursor/bank-44329-relay-deposit-match-7fe0` only)

- `apps/backend/src/accounting/bank-recon/**` (match kinds, relay deposit math, hints API, match/unmatch/void hooks)
- `apps/backend/src/banking/**` (routes, pointers, state machine, dedup as required for `relay_deposit` pointer)
- `apps/frontend/src/pages/banking/**` (MatchDrawer split + read-only hints panel)
- `db/migrations/202610101430_relay_deposit_is_a_bank_match_target.sql` + `CLAIMED-MIGRATION-NUMBERS.json` claim for that id
- Guards: `verify-relay-deposit-is-a-bank-match-candidate.mjs`, `verify-bank-match-is-a-document-pointer.mjs`, `verify-every-void-releases-its-bank-lines.mjs`, `scripts/lib/bank-feed-state-machine.mjs`, verify-step **3996** wiring, `docs/schema-parity-baseline.json` regen from migration

No seed. No rewrite of existing categorized Relay wallet outflows. No QBO write-back.

## Cite

`LANE_CROSS=2026-10-10-LEAD-RULING-CURSOR-44329-RELAY-DEPOSIT-BANK-MATCH-LANE-CROSS.md`
