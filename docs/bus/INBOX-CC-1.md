# INBOX-CC-1 · GO-23 WAVE 1 · PURGE + GO-24 API + N1 REMAINDER + B5

`git pull --ff-only origin/main`

**FAST-MERGE ON (4 min).** Gate exit 0 = merge proof. Same turn: `gh pr create` → `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`. Never `gh pr checks --watch`. Never wait CI. Never ask Jorge. Push hook ONLY `ENV-VERIFY-STATIC-NO-LOCAL-PG` after gate PASS → `--no-verify` authorized. Law: `docs/bus/FAST-MERGE-4MIN-LAW.md`.

**Queue:** `claude/GO-23-BUILD-SEQUENCE-STRICT-2026-09-02.md`

USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`. Neon `tiny-field-89581227` / `br-fancy-credit-akjnd07a`. Never POST Book Load. Never seat financial fixtures. **Mileage CLOSED.** **Do not create `catalogs.locations`.** Trimble proxy stays (dormant).

## VOID
POST Book Load · create locations table · reopen `catalogs.lane_mileage` / Google Places · remake expense N1 on `LoadDetailDrawer` (**#19641** already wired ExpenseCreate + RecordExpenseModal) · remake lumper **#19634** · TONU · raise A2 100 · treat purge as finished

## NOW — four Wave-1/2 items, this order (ship each FAST-MERGE, do not batch forever)

**1. Purge hole (live money contamination).** `dispatch.load_templates` USMCA **one row** `67138fcf-59d8-4833-bdab-b8571ca5701b` **TEST DATA TESTMTDQIUGL** — delete it. Sweep 33 named tables with no `is_sample_data` for name/label matching test|sample|demo|qa|dummy|xxx. **Counts BEFORE delete.** Owner decides KEEP names (`TEST-CC3-GO0085 KEEP`, `TEST DATA keep`). Add `is_sample_data` default false on fixture-capable tables. 2 sample drivers still: `9f35cf21-…` TEST DriverTESTMTDP79YF, `db37af23-…` CODEX ACTIVE FLEET TEST. Finish all 33, paste before/after.

Live SELECT 2026-09-02 (nothing deleted):

| Table | USMCA rows | name-junk |
|---|---:|---:|
| `dispatch.load_templates` | 1 | 1 |
| `accounting.recurring_bill_templates` | 1 | 1 (`TEST Recurring Bill 20260806 - CC3 battery`) |
| `catalogs.posting_templates` | 11 | 0 |
| `catalogs.equipment_line_item_templates` | 15 | 0 |
| `accounting.fixed_assets` | 0 | 0 |
| `safety.safety_events` | 7 | 6 |
| `safety.fmcsa_events` | 1 | 1 |
| `safety.training_programs` | 1 | 1 |
| `legal.matter_documents` | 1 | 1 |
| `maintenance.pm_schedules` | 1 | 1 |

**2. GO-24 backend (tiny).** `GET`/`POST /api/v1/mdata/locations` exists. Search ILIKE is name/code/address/city — **not customer**. Add customer (join `mdata.customers` or `linked_customer_id` name) to the existing `search` predicate if missing. Do not add a second route. Then CC-3 ships the picker.

**3. N1 remainder.** Expense from load **is on git main** (`LoadDetailDrawer` Add expense + Record expense). Claude’s “N1 is still zero” grep is **stale vs #19641**. Still missing on the load surface: **bill create** and **bill-payment create** load-scoped (owner: expense, bill, bill-payment). Wire those; do not remake the expense buttons. CC-2 verifies Chrome after deploy.

**4. B5.** Driver pay rate / mi still editable **0**. Resolve from driver profile.

TONU HOLD.

ACK `CC-1 | ACK | GO-23 | NOW=purge-33 · GO-24 API if missing · N1 bill+bill-payment from load · B5 · NEVER locations table · NEVER POST | GO`
