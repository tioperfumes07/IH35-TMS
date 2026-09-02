# SAMPLE-DATA PURGE (owner-locked 2026-09-02 — PERMANENT, narrow scope)

**Owner word (2026-09-02, chat):** "junk gets deleted, not voided" — master map 1.2 ("PURGE test
data, not just void, it is junk, not real voided records"), and same-session: "all transactions
were instructed to be voided and permanently deleted" / "it's obvious future transactions must be
deleted as well."

**Supersedes**, narrowly, `docs/lockdown/NO-SEAT-PROD-FINANCIAL-FIXTURES-LAW-2026-09-01.md` item 3
("void by UUID; never DELETE money rows") **only** for rows matching the predicate below. Every
other line of that law (no standing fixtures, create→prove→void for future owner-ordered walks,
no seat override memos) remains in force unchanged.

## The predicate — both conditions, always, no exceptions

```sql
operating_company_id = <entity>  AND  is_sample_data = true
```

Never by date, never by description/memo text ("text matching is not a control" —
`NO-SEAT-PROD-FINANCIAL-FIXTURES-LAW-2026-09-01.md` §4). A row carrying `plaid_transaction_id` (or
any other live-system backing reference) must survive; if a statement would remove one, the
predicate is wrong and the operation stops.

**Frozen-entity trap (real, hit live this pass):** any table carrying `is_sample_data` with **no**
`operating_company_id` column (`mdata.units`, `mdata.equipment`) cannot take this predicate at all.
Scope through the row that actually carries the company (`owner_company_id` /
`currently_leased_to_company_id` per `00-IH35-LAW`). If a unit/equipment row is not provably the
purging entity's own (owned by it, not merely leased to it), **do not delete it** — report and
stop. `TRANSPORTATION`/`TRUCKING` stay frozen regardless of what a purge for another entity finds
sitting in a shared table.

**Cascade rule:** every FK-referencing row is purged in the same transaction, or the delete is
refused for that one parent row. A row an append-only/WORM trigger physically refuses to delete
(evidence tables — `dispatch.stop_arrivals`, `telematics.vehicle_driver_assignments`,
`safety.dvir_submissions`, `safety.harsh_events` confirmed this pass) means its parent is excluded
from the purge, reported, not forced. `accounting.*` WORM triggers (`trg_worm_refuse_delete`) only
block the **application role** (`ih35_app`) — they pass a privileged owner-authorized DBA session
(`RESET ROLE`) through by design; that is the mechanism this purge used, not a bypass of it.

## USMCA purge executed 2026-09-02 (live, tiny-field-89581227)

| Table | Before (sample/total) | After (sample/total) | Note |
|---|---|---|---|
| `banking.bank_transactions` | 34/415 | 0/381 | 6 had `banking.reconciliation_matches`; those matches were purged first (owner-authorized DBA session, not the app role) so the cascade completed |
| `mdata.drivers` | 11/176 | 2/167 | **9 of 11 purged.** 2 held back: `9f35cf21-…` (append-only `dispatch.stop_arrivals` row), `db37af23-…` (append-only `telematics.vehicle_driver_assignments` row) — both refused, not forced |
| `accounting.invoices` | 1/1 | 0/0 | + 1 `invoice_lines` child |
| `mdata.loads` | 1/1 | 0/0 | + children: `load_charge_lines`(2), `load_assignment_history`(1), `load_cancellations`(1), `load_stops`(2), `docs.files`(2)+`file_links`(4) |
| `mdata.equipment` | 3 sample, **no `operating_company_id`** | unchanged | all 3 are TRK-owned (`owner_company_id=b49a737b…`), merely leased to USMCA — **not purged**, frozen-entity rule |
| `mdata.units` | 11 sample, **no `operating_company_id`** — invisible to a non-bypass read, exactly the trap named | unchanged | all 11 are TRK-owned, same reason — **not purged** |
| `dispatch.non_owned_trailers`, `dispatch.trailer_interchanges` | 0/0 | 0/0 | new GO-21 A1 tables, already clean |
| all remaining `is_sample_data`-carrying tables (`bill_payments`, `bills`, `expenses`, `journal_entries`, `payments`, `reconciliation_drift_alerts`, `cargo_sensor_incidents`, `driver_settlements`, `settlement_lines`, `factoring.batch`, `predictive_alerts`, `customers`, `vendors`, `accident_liabilities`) | 0 sample | 0 sample | swept, nothing to purge |

**Verified after:** `banking.bank_transactions` 381 total / 381 with `plaid_transaction_id` — the
Plaid-backed real corpus is untouched. `accounting.invoices` 0, `mdata.loads` 0.

**Read-reliability note for the next purge:** `SELECT set_config('app.bypass_rls','lucia', true)`
inside a pooled `run_sql_transaction` produced a stale/masked read twice this pass (`mdata.units`
showed 0/0 sample rows under it, 11/196 under `RESET ROLE`; `dispatch.load_charge_lines` showed 0
rows under it, 2 real rows under `RESET ROLE`, which is what actually blocked the first delete
attempt via a live FK violation). `RESET ROLE` (the owner-authorized DBA session, not the
bypass-flag session var) is the reliable read for any cascade check that gates a delete.

## Guard note

`scripts/verify-no-bulk-test-void.mjs` still fails a `DELETE FROM … is_sample_data` pattern
**committed as code** (migration, app, or script) — that block is unchanged and correct: this law
authorizes a one-time, owner-directed, evidence-logged DBA operation, never an automatable/coded
bulk-delete path. This file is added to that guard's `SKIP` list for the same reason its sibling
law docs are (`CREATE-TEST-THEN-VOID-LAW-2026-08-22.md`,
`PASTE-ALL-SEATS-GO-2026-08-28-0007-G1-LABEL.md`) — it quotes the predicate as evidence, not code.

## Companion

`docs/lockdown/NO-SEAT-PROD-FINANCIAL-FIXTURES-LAW-2026-09-01.md` (still governs everything except
the narrow purge case above) · `docs/audit/GUARD-WORKORDERS.md` (board row `SAMPLE-DATA-PURGE-2026-09-02`).
