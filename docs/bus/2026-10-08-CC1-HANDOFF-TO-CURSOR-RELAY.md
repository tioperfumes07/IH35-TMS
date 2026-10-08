# HANDOFF CC-1 → CURSOR — Relay lane (ROUND 441.17 #3), 2026-10-08

CC-1 stops here per the Lead's ROUND 441.17. Everything below is measured; nothing is half-written in main.

## 1. Relay backfill on the new Transportation key — NOT DONE, blocked by Relay timeouts
- Mechanism (merged #25773, LST-F435): `RELAY_FUEL_BACKFILL_ONCE="<run_id>|USMCA|<months>"` on the backend env runs the
  existing `runRelayFuelBackfill` once per run_id at boot. The Relay key never leaves the server. Set it with the Render API
  (workspace tea-d7cg3g99rddc739n3obg, service srv-d7rpem7avr4c73fhp4n0), merge mode.
- Run 1 `r441-15-usmca-backfill-1|USMCA|3`, OLD key: every 7-day window 07-01→09-29 `raw_rows=0` (Relay answered empty),
  then HTTP 429. Proof the old key reached an empty account.
- Run 2 `r441-15-usmca-backfill-2|USMCA|2`, NEW key (owner set RELAY_API_KEY_USMCA = Transportation key): failed
  `relay_window_timeout_at_min_window:2026-08-01..2026-08-01 still failed at 1 day (relay_network_error: This operation was
  aborted)`. That is the same failure the frozen TRANSP pull has had daily since 10-03. The new key reaches the real account.
  Relay does not answer a single-day window inside the client budget (RELAY_WINDOW_CALL_TIMEOUT_MS default 15000).
- **Next for Cursor:** check Relay's response time for one day on this account (the client logs `api_rows`). Then either raise
  the per-call budget (env RELAY_WINDOW_CALL_TIMEOUT_MS, clamped by lib/relay-timeout) or ask Mike (Relay) why one day times
  out. Re-run with a NEW run_id. Report fills per week (weeks 34, 38, 09-27→today). Keep the 10-second minimum gap between
  calls (Mike's limit).
- The daily tick (RELAY-F440, merged #25763) now records finished_at / success / error_message. The 12:00Z tick on
  10-08 is the first that can record a readable error: read `integrations.integration_sync_log` (integration='relay').

## 2. RELAY-F441 — guard committed, NOT merged
- Branch `cc-1/relay-f441-fuel-items-parsed-guard` (db60682445): `scripts/verify-relay-fuel-items-parsed.mjs`. Static S1–S2 plus
  live L1–L3: every fill's fuel_items are parsed into integrations.relay_fuel_transaction_lines and sum to total_amount_paid.
  Selftest 5/5; live PASS on prod (1,764 fills, 0 gaps).
- Finding: the parse ALREADY exists (the order assumed it did not). Real follow-up: per-unit prices are stored in cents and
  lose the third decimal (4.889 → 489); line totals are exact.
- **Next for Cursor:** gate and merge the branch (needs a lane note: scripts/verify-* is CC-1's — this handoff is the authority).

## 3. Relay matching engine (441.15 #4) — NOT STARTED
- Extend, do not duplicate: `apps/backend/src/fuel/relay-fill-link.service.ts` (truck ±1 day, product, gallons ±0.6, exactly-one
  rule) and the `relay_fuel` kind in `apps/backend/src/accounting/bank-recon/match.service.ts` (findCandidates).
- The order: recommend only, never auto-match. Rank on unit (prompts "Truck #" + matched_unit_number), date then fill TIME,
  amount, gallons, fuel_type (from relay_fuel_transaction_lines), merchant, location. Show which fields matched. Guard: a
  recommendation cites unit + date + amount, never a single field.
- Then feed the fill time into autoLoadNumberForExpenseDate / fuelNeedsExplicitLoadNumber (same-day pickup/delivery tie-break).

## 4. Neon forks — DONE
br-shy-wildflower-akncgc1a, br-red-meadow-aknhkedd, br-twilight-night-akmnrs5o, br-blue-firefly-akm9ds0b are all deleted.
CC-1 has no forks left.
