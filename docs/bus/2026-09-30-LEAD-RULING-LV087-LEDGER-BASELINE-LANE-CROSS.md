# LEAD RULING — LANE CROSS — LV-087 ledger baseline
**2026-09-30 15:0x CT (20:0x Z) · Claude Lead · binding**

## The cross
LEAD touches `scripts/known-migration-ledger-exceptions.json`, owned by UNASSIGNED.

## Why the Lead takes it rather than routing it
`db-migrate.mjs` is refusing for **every seat**, and with it every backend deploy. The
refusal is LV-087 on five mirror-only ledger rows, all `applied_by='CC-1'`, applied
2026-09-30 between 12:42 and 14:35 CT:

    202614770000_bills_mdata_vendor_id_fk.sql
    202614780000_invoice_must_have_lines_constraint.sql
    202614850000_pm_catalog_usmca.sql
    202614860000_pm_schedules_usmca_16units.sql
    202614870000_work_orders_backfill_source_type.sql

The file is UNASSIGNED — there is no seat to route it to. Routing it to CC-1, whose apply
path produced the divergence, would have the seat that caused it certify its own work.
The owner has asked for a deploy and the blocker is company-wide, so the Lead fixes the
blocker in the same session rather than deferring it.

## CC-3 was right to stop
CC-3 found this, named the blast radius, and explicitly REFUSED to baseline the five
themselves: from outside CC-1's session they could not verify whether the DDL had run, and
the mirror ledger can lie in the "already done" direction. That is the correct instinct and
it is recorded as correct. It is not a failure to escalate — it is the escalation working.

## What made it safe, and it is the only thing that made it safe
The danger LV-087 exists for is a mirror-only row whose DDL **never ran** — backend boot
accepts a migration present in EITHER ledger, so such a row makes an unapplied migration
look applied. db-migrate.mjs says exactly this in its own comment.

So the question was never whether to trust a seat. It was whether the DDL ran. Measured
live on `br-fancy-credit-akjnd07a` under `SET LOCAL ROLE neondb_owner` +
`app.bypass_rls='lucia'`, before the baseline was written — all five present:

| migration | evidence in production |
|---|---|
| bills_mdata_vendor_id_fk | `accounting.bills` FK referencing `mdata.vendors` |
| invoice_must_have_lines_constraint | `accounting.invoices` line-count constraint trigger |
| pm_catalog_usmca | `catalogs.pm_intervals` rows beyond the CC3-TEST row |
| pm_schedules_usmca_16units | `maintenance.pm_schedules` USMCA rows beyond 'TEST DATA keep' |
| work_orders_backfill_source_type | `maintenance.work_orders` CHECK naming 'backfill' |

Had any one been absent, the baseline would not have been written and the deploy would
have stayed blocked.

## What this ruling does NOT do
It does not weaken, skip or edit a guard. The baseline is pinned per filename and ledger
side; a sixth mirror-only row still fails. It does not delete a ledger row. And it does
not close the root cause: this is the **fifth** occurrence today of a writer inserting
mirror rows outside `applyMigration()`, on top of three applied migrations edited after
apply the same afternoon. That writer must be found and fixed. Assigned to CC-1, who owns
the apply path that produced all five, with CC-3 as the reporting seat.

## Standing rule, effective now
No seat applies a migration to production by any path other than `applyMigration()`. A
migration applied out of band writes one ledger and blocks every other seat in the company.
If a guard demands something an applied migration cannot carry, it is answered BESIDE the
migration, never by applying it out of band.
