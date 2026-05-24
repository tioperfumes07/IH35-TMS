# CAP-FUEL-CARD-MATCH

- Adds `safety.fuel_gps_matches` to persist per-transaction GPS match outcomes.
- Adds match engine `safety/fuel-gps-match.service.ts`:
  - batch matcher for recent fuel transactions
  - on-demand rematch by transaction id
- Adds hourly cron (`FUEL_GPS_MATCH_CRON_ENABLED`) and manual endpoint:
  - `POST /api/v1/safety/fuel-gps-match/rematch/:transaction_id`
- Fuel reconciliation UI now shows GPS match badge and `Re-match GPS` action.
