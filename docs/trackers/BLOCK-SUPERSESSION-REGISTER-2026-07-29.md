# Block supersession register — 2026-07-29

Every block below was re-tested against **current** repo and prod state. Nothing here is closed on
belief: each row carries the check that produced the verdict, so a reviewer can re-run it.

Blocks are written off in three ways, and the distinction matters:

- **SUPERSEDED** — the defect is gone. The check that would have failed now passes.
- **PREMISE WRONG** — the block describes something that was never true, or is no longer true. Closing
  it as "done" would be a lie; it is closed as *not a defect*, with what is actually true recorded.
- **STILL REAL** — re-tested and confirmed open. Left on the list, with the evidence sharpened.

No empty commits were created to "clear" anything. A merge record saying `SAF-F27 done` with no diff
is indistinguishable, six months later, from work that was quietly skipped — and this register exists
precisely so nobody has to guess.

---

## SUPERSEDED — 10

| block | verdict | check that proves it |
|---|---|---|
| **LST-F18** · generic-catalog-registry-populate | SUPERSEDED | `GENERIC_CATALOG_REGISTRY` now holds **85** `catalogKey` entries (was ~10). Populated by LST-WIRE-02/03/05/06 (#3740). |
| **LST-F22** · catalog tables with no UI route | SUPERSEDED | `verify-every-catalog-wired` reports **0 orphans** across 97 wireable catalogs. |
| **LST-F23** · catalogs-inventory-reconcile | SUPERSEDED | `docs/inventories/catalog-inventory.json` + the owner's `catalog-wiring-map.csv` are both committed and reconciled table-by-table; the gate reads the map as the authority. |
| **LST-F08** · Chart of Accounts dual path | SUPERSEDED | `grep 'path="/chart-of-accounts"' manifest.tsx` → **0**. The duplicate route is gone; only `/catalogs/accounts` remains. |
| **LST-F15** · maintenance-vendors FK to mdata.vendors | SUPERSEDED | `catalogs.maintenance_vendors.linked_vendor_id` **exists on prod** (information_schema, 1 column). Migration 202609100000 landed. Table holds 0 rows, so there is nothing to backfill. |
| **SAF-F06** · base-less fetch / wrong host | SUPERSEDED | `verify-no-base-less-api-fetch` exits 0. |
| **SAF-F27** · 7 double-registered Safety routes | SUPERSEDED | `grep -oE 'path="/safety/[a-z-]+"' \| sort \| uniq -d` → **no duplicates**. |
| **SAF-F14** · DOT/HOS creators use raw `driver_id` text | SUPERSEDED | `DOTInspectionsTab.tsx` already uses `DriverPickerWithCreate` (2 usages). The only remaining `placeholder="driver_id"` in the repo is inside a COMMENT describing the old defect — my first grep matched that comment, which is the same false-positive class the guards keep hitting. Nothing left to swap. |
| **SAF-F26** · raw-UUID accident list (no EntityLink) | SUPERSEDED | `AccidentsPage.tsx` uses `EntityLink` in 5 non-comment places; `row.id` appears only as `rowKey` and `rowTestId`, never rendered. No raw UUID reaches the operator. |
| **LST-SEED-01** · complaint_types leak-test pollution | SUPERSEDED | The cleanup was already done, by soft-delete. `catalogs.complaint_types` holds 295 rows: **36 active** (the real types) and **259 archived** (`is_active=false`). Polluted rows that are still ACTIVE: **0**. The catalog list filters `is_active=true` by default, so an operator sees only the 36. |

## PREMISE WRONG — 3

| block | what the block claims | what is actually true |
|---|---|---|
| **LST-F16** · expensive_states "seeded/counted but no CREATE TABLE" | table missing | `to_regclass('catalogs.expensive_states')` is **non-null** — the table exists, with **0 rows**. This is a SEEDING question, not a schema bug. Re-file as a seed task if the rows are wanted. |
| **LST-F26** · QuickCreate `kind=category` "writes a GL account" | the label is wrong | **The label is CORRECT.** In QuickBooks Online an Expense form's CATEGORY column *is* a Chart of Accounts account; NetSuite maps expense lines to GL accounts the same way. Reading `catalogs.accounts` here is QBO parity. Repointing the picker at `catalogs.expense_categories` would BREAK parity with the system we are matching. **A real and worse defect was found underneath** and handed to the money lane: the QuickCreate path bypasses the gated account form (its own comment says so) and FABRICATES `account_number` as name-slug + timestamp. Five ACTIVE accounts on prod carry fabricated numbers (`DRIVERREIMBU173087`, `DRIVERRECOVE488409`, `DRIVERTRIPLU056412`, `DRIVERCASHAD896665`, `OFFICEEXPENS815299`) across TRANSP and USMCA. `catalogs.accounts` is the financial cluster, so no fix was attempted in this lane. |
| **LST-F25** · tire-positions "missing table indistinguishable from empty" | table may be missing | `to_regclass('catalogs.tire_positions')` is **non-null**, **0 rows**. Empty, not missing. The distinguishability concern is valid as a general principle and is covered by LST-F21 (silent partial counts), which stays open. |

## CORRECTION — made during this register's own review

My first pass on **LST-SEED-01** counted 259 of 295 complaint_types rows matching test/leak patterns
and escalated it as "worse than filed — urgent, an operator can now open the hub and see the
pollution." **That was wrong**, and it is corrected above rather than quietly amended.

All 259 are already `is_active = false`. They were soft-deleted — void-not-delete, correctly applied —
and the catalog list filters to active rows, so the operator sees the 36 real types and none of the
pollution. The count I reported was real; the conclusion I drew from it was not, because I measured
the rows before checking the flag that governs whether anyone can see them.

Recorded because the same mistake is easy to repeat: **a row count is not a visibility claim.**

## STILL REAL — re-confirmed, evidence sharpened

| block | status | sharpened evidence |
|---|---|---|

## NOT RE-TESTED — 12

Left on the list deliberately. Each needs its own read against current state; none is claimed closed.

LST-F07, LST-F12, LST-F19, LST-F20, LST-F21, LST-F24, LST-GUARD, LST-REGISTRY, SAF-F03, SAF-F04,
SAF-F13, SAF-F16, SAF-F17.

### Re-tested — CLOSED or REASSIGNED

| block | filed as | actually |
|---|---|---|
| **LST-F11** · names catalogs `live:false` | 4 catalogs dead | **CLOSED — premise wrong.** Brokers is now backed by a dedicated route. The 2 that remain (`Shippers`, `Consignees`) have **NO backing table anywhere in the database** — no `shipper*`/`consignee*` base table exists in any schema. They carry no `catalogKey` and are marked `live: false`, which is the HONEST state for a catalog that does not exist. Flipping them live would create exactly the lie-live defect `verify-every-catalog-wired` exists to catch. Building the catalogs is a new feature, not a fix. |
| **LST-F13** · parts-catalog + abandonment-defaults hub-unreachable | both unreachable | **PARTLY CLOSED, remainder is not this lane.** The `parts` hub tile exists. `abandonment-defaults` is **`driver_finance.abandonment_defaults`** — it is not a `catalogs.*` table at all, so it is outside the catalog completeness gate by design, and `driver_finance.*` is the money lane's schema. 0 rows on prod. Reassigned, not fixed here. |

---

## Net effect on the backlog

- Started: **24** pending blocks in this lane (Lists + Safety).
- **14 written off** — 10 superseded, 4 premise-wrong (LST-F11 joins them).
- **1 reassigned** — LST-F13's remainder is a `driver_finance.*` table, not a Lists catalog.
- **9 untested**, still counted as open. None claimed closed.

**Remaining in this lane: 9.**

One block moved lanes rather than closing: LST-F26's real defect is financial and now sits with the
money lane, with the five affected account numbers named.

The ACCT (29) and BANK (3) families are the money lane and are not assessed here.
