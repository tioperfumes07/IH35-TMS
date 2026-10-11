# LANE_CROSS: CC-1, ROUND 443.36, Relay-fill posting through Creator (2026-10-10)

**Lead ruling:** "LEAD RULING 10:24 PM CT — Relay-linked fuel row on a Creator settlement (5772): OPTION (a). CC-1 owns it, deadline 04:00 UTC. A Creator fuel row matched to a Relay fill posts THROUGH THE RELAY FILL as its source, at Creator post: Dr the fuel account per product + Dr Fuel Card Fees for the Relay fee / Cr Relay Fuel Wallet = relay total, source_transaction_type fuel_event = the linked integrations.relay_fuel_transactions row — so trg_relay_wallet_consumed_only_by_relay_fill accepts it and the same fill can never post twice. The gate's fuel.expense_posted accepts that fill posting for a Relay-linked row. Load, truck, driver, entity on every line. Guard: verify-creator-relay-row-posts-through-its-fill.mjs + selftest."

Source: `~/IH35-LEAD-CHANNEL/2026-10-10-LEAD-TO-SEATS.md` line 1434–1442.

**Files crossed into (CC-3's lane):**
- `apps/backend/src/driver-finance/settlement-creator.service.ts` — relay_link outcome: link then post through the fill via `postFuelExpenseOnClient`
- `apps/backend/src/driver-finance/feed-gate/feed-gate.checks.ts` — `fuel.expense_posted` gate accepts `posting_batches` fuel_event path for relay-linked rows

**CC-1's own files (no cross):**
- `scripts/verify-creator-relay-row-posts-through-its-fill.mjs` — new guard

**CC-3:** nothing to do. This is CC-1's authorized build. CC-3 proves on fork with 5772 after this merges.
