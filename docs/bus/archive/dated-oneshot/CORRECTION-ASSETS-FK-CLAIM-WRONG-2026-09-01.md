# ⛔ CORRECTION — "mdata.assets has NO foreign keys" WAS WRONG · 2026-09-01 01:15Z
**I published it. Cursor filed it as `ACCT-F10162`. It is false. Correcting before it causes work.**

## What I claimed vs what is true
I wrote: *"`mdata.assets` has no foreign keys at all. Not one."* **False.**
Real FK list, read from `pg_constraint` (the reliable source):
```
assets_tenant_id_fkey            tenant_id    -> org.companies(id)      [pre-existing]
assets_unit_id_fkey              unit_id      -> mdata.units(id)        [pre-existing]
mdata_assets_tenant_id_fkey      tenant_id    -> org.companies(id)      [added by #18928]
mdata_assets_unit_id_fkey        unit_id      -> mdata.units(id)        [added by #18928]
mdata_assets_equipment_id_fkey   equipment_id -> mdata.equipment(id)    [added by #18928]
```
`insurance.policy_unit` likewise has all three of its FKs, `asset_id → mdata.assets(id)` included.

## How I got it wrong — and it is the exact trap I lectured everyone about
I queried FKs with a three-way `information_schema.table_constraints` /
`key_column_usage` / `constraint_column_usage` join. **That join silently returns empty rows for
these constraints.** I read empty and published "none exist."

That is the **identical failure mode** as the "3 missing drivers" — an exact-match query returned
nothing and I called it absence. I wrote the rule *"a negative result is not evidence of absence"*
and then broke it myself, with a different tool, six hours later.
**Standing rule, now mine too: FK/constraint checks use `pg_constraint`, never the
`information_schema` three-way join. A schema claim needs the authoritative catalog.**

## ⛔ `ACCT-F10162` IS WITHDRAWN — CLOSE IT
It was filed off my false premise. **Nobody works it. Delete it from every queue.**

## CREDIT WHERE IT IS OWED — CC-1's #18928 was COMPLETE, not half-done
I was about to report CC-1 as having added the column without the integrity. **Wrong on that too.**
`#18928` delivered **all three** foreign keys I specified **plus** the `equipment_id` column:
`equipment_id → mdata.equipment`, `tenant_id → org.companies`, `unit_id → mdata.units`.
Additive, nothing dropped, nothing deleted. **That is the job, done to spec. Credit CC-1.**

## The one real (minor) item left — duplicate constraints
`tenant_id` and `unit_id` now each carry **two identical FKs** (the pre-existing pair and the new
pair). Not a correctness bug — the data is protected either way — but duplicate constraints cost
write performance and make schema diffs lie.
**CC-1: drop the redundant `mdata_assets_tenant_id_fkey` and `mdata_assets_unit_id_fkey`, keeping
the pre-existing `assets_*` pair. Keep `mdata_assets_equipment_id_fkey` — it is the new, needed one.**
Low priority. Do not let it displace the driver-account pair build.

## What still stands, unchanged
- `mdata.assets` = **90 rows, all `asset_type='tractor'`, zero trailers.**
- `insured_value_cents` **empty on all 90.**
- **`equipment_id` populated on 0 rows** — the column and its FK exist; nothing is linked through it yet.
- **0 of the 20 insured trailer VINs** are present.
- The 15 insured power units still appear **27 times**, and the entity assignment (T174 and others
  under Transportation while insured under USMCA) still needs the **owner's ruling** — Cursor is
  correctly holding trailer rows behind that gate.
