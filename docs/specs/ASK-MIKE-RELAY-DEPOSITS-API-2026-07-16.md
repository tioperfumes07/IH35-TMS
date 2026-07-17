# ASK MIKE — Relay deposits API (non-blocking)

**Date:** 2026-07-16  
**Context:** TMS fuel ingest uses `GET https://app.relaypayments.com/api/fuel/transactions/` (confirmed). Wallet **Received** (company funding deposits) is empty on prod because deposits only enter via CSV `type=deposit`, and no CSV has been imported (`integrations.relay_deposits` = 0).

## Question for Mike

Is there a REST endpoint that lists **wallet deposits / funding** (card deposits into the Relay account), separate from fuel transactions?

If yes, please send:
1. Exact URL path
2. Auth (same raw `Authorization` key?)
3. Example JSON row (id, amount, created_at, note / card last4, status)
4. Date filter param names (if any)

If no: we keep **CSV export with `type=deposit`** as the lasting source of truth and will document that for ops.

## TMS behavior already built (no need to wait)

- CSV `type=deposit` → classify → mirror to Relay Fuel Wallet bank feed as **Received** (`is_credit`)
- Backfill endpoint for historical `relay_deposits` rows
