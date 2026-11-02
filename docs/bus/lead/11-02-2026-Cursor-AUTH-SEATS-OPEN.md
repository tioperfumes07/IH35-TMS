# OPEN AUTH seats — owner must issue (2026-11-02 CT)

Seats must **not invent** AUTH ids. These are ready scripts waiting on OPEN rows in `OWNER-AUTHORIZATIONS.md`.

| Need | Script / path | Why |
| --- | --- | --- |
| **ENG-48 fuel bridge** | `scripts/ops/2026-09-30-cc1-r290-1-fuel-expense-bridge-backfill.ts` with `OWNER_AUTH_ID` + non-DRY_RUN | LIVE **147** USMCA fuels with no live expense (`source_fuel_transaction_id`). AUTH-145 **CONSUMED**. |
| **ENG-29/53 miles backfill (optional)** | `scripts/ops/2026-10-25-cc3-eng29-backfill-real-driven-miles.mts --apply` + `OWNER_AUTH_ID` | Cron SAVEPOINT fix (#27976) should stamp 13690 on next `:25` **without** AUTH. One-shot historical apply still AUTH-gated. |
| **ENG-60 table drop** | migration drop `insurance.lawsuit` after all-entities 0 + route retirement | FE cutover DONE; lawsuit=0; drop is owner AUTH. |

Claude still held.
