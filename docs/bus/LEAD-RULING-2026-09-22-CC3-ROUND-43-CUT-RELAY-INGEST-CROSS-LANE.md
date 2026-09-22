# LANE_CROSS — CC-3 — ROUND 43 FOLLOW-UP ITEM 2: CUT THE RELAY INGEST — 2026-09-22

## Authorization

Lead, 2026-09-22, Round 43 follow-up (mid-session directive, same round as FUEL-DEDUPE-01/02/03/04):

> 2 of 4 — CUT THE RELAY INGEST. `banking.bank_transactions` and nothing else — no fuel row, no
> expense, no GL, AND it may not set its own line's status, category or match. That last half is
> new and it is the part we missed.

## Root cause this closes

Round 43's own investigation (FUEL-DEDUPE-01 through 04, this same session) found 39 confirmed
duplicate `fuel.fuel_transactions` rows — the SAME real fuel purchase landing twice, once via
Dreamline's statement ingest and once via `bridgeRelayFuelToCanonical`'s unconditional Relay
bridge. That bridge was itself the generative cause: every future Relay transaction would keep
manufacturing another duplicate, not just the 39 already found and archived+reversed.

Separately, `upsertRelayWalletBankFeedRow` was auto-writing `categorization_unit_id`,
`categorization_driver_id`, `matched_load_id`, and `matched_settlement_id` onto the
`banking.bank_transactions` row at ingest time — an unreviewed, ingest-time auto-match with no
human behind it, the exact shape `scripts/verify-no-automatch.mjs` (Owner Law B, 2026-09-12:
"it should never automatch, it suggests and we accept it or change the transactions") already
prohibits for every OTHER writer of these columns. `relay-wallet-bank-feed.service.ts` was never
on that guard's `TARGET_COLUMN_WRITE_ALLOWLIST` — a real, pre-existing gap in that guard's own
coverage, now moot since the writes are removed rather than allowlisted.

## Files touched outside CC-3's own lane

**`scripts/verify-relay-wallet-bank-feed.mjs`** — `scripts/verify-*.mjs` is CC-1's lane generally.
This 2026-07-16 guard explicitly REQUIRED `categorization_unit_id`/`categorization_driver_id`/
`matched_load_id`/`matched_settlement_id` to be set by the wallet feed — the exact behavior this
ruling reverses. Updated its two assertions to check the OPPOSITE (no SQL write of those columns),
using an SQL-write-shape-specific regex (`= $N` / a bare column-list identifier) so the
audit-log's own JS object-literal mention of `matched_load_id`/`matched_settlement_id`
(informational only, never written to the row) does not false-positive the check. Verified the new
check actually catches a regression: planted `matched_load_id = loadId,` back into the file
temporarily, confirmed the guard FAILS, restored the file, confirmed the guard passes again clean.

## What stayed in CC-3's own lane, no cross needed

`apps/backend/src/integrations/relay-payments/**` (fuel ingest), `apps/backend/src/fuel/**` — both
already CC-3's lane per `docs/bus/LANES.md` (`apps/backend/src/fuel/**`, and `relay-payments/**` is
the fuel-card-integration surface this session has worked in throughout Round 43).

## Scope note — `banking.bank_transactions` is CC-2's table generally

This change only REMOVES writes from an existing CC-3-lane file (`relay-wallet-bank-feed.service.ts`,
part of the fuel-card ingest pipeline, not `banking/**` itself) — it does not add any new write to
`banking/**` proper. The separate, still-open question of HOW a human "Match" action should work for
a Relay bank line against its real Dreamline-statement counterpart (Round 43 follow-up item 1's
"MATCH the Relay bank line to the statement expense") is explicitly named as CC-2's lane in
FUEL-DEDUPE-03/04's own REMAINING section — not attempted here either.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Lv9avWehXBjdPLVwBdMsi1
