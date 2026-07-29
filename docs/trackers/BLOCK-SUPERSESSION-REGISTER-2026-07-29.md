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

## SUPERSEDED — 8

| block | verdict | check that proves it |
|---|---|---|
| **LST-F18** · generic-catalog-registry-populate | SUPERSEDED | `GENERIC_CATALOG_REGISTRY` now holds **85** `catalogKey` entries (was ~10). Populated by LST-WIRE-02/03/05/06 (#3740). |
| **LST-F22** · catalog tables with no UI route | SUPERSEDED | `verify-every-catalog-wired` reports **0 orphans** across 97 wireable catalogs. |
| **LST-F23** · catalogs-inventory-reconcile | SUPERSEDED | `docs/inventories/catalog-inventory.json` + the owner's `catalog-wiring-map.csv` are both committed and reconciled table-by-table; the gate reads the map as the authority. |
| **LST-F08** · Chart of Accounts dual path | SUPERSEDED | `grep 'path="/chart-of-accounts"' manifest.tsx` → **0**. The duplicate route is gone; only `/catalogs/accounts` remains. |
| **LST-F15** · maintenance-vendors FK to mdata.vendors | SUPERSEDED | `catalogs.maintenance_vendors.linked_vendor_id` **exists on prod** (information_schema, 1 column). Migration 202609100000 landed. Table holds 0 rows, so there is nothing to backfill. |
| **SAF-F06** · base-less fetch / wrong host | SUPERSEDED | `verify-no-base-less-api-fetch` exits 0. |
| **SAF-F27** · 7 double-registered Safety routes | SUPERSEDED | `grep -oE 'path="/safety/[a-z-]+"' \| sort \| uniq -d` → **no duplicates**. |
| **LST-SEED-01** · complaint_types leak-test pollution | SUPERSEDED | The cleanup was already done, by soft-delete. `catalogs.complaint_types` holds 295 rows: **36 active** (the real types) and **259 archived** (`is_active=false`). Polluted rows that are still ACTIVE: **0**. The catalog list filters `is_active=true` by default, so an operator sees only the 36. |

## PREMISE WRONG — 2

| block | what the block claims | what is actually true |
|---|---|---|
| **LST-F16** · expensive_states "seeded/counted but no CREATE TABLE" | table missing | `to_regclass('catalogs.expensive_states')` is **non-null** — the table exists, with **0 rows**. This is a SEEDING question, not a schema bug. Re-file as a seed task if the rows are wanted. |
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
| **LST-F26** · QuickCreate `kind=category` writes a GL account | **REAL** | `catalogPickerRegistry.ts:269` — `category` declares `readTable`/`writeTable` = `catalogs.accounts` and writes `/api/v1/catalogs/accounting/chart-of-accounts`. Labelled "category", creates a chart-of-account. Confirmed exactly as filed. |
| **SAF-F14** · DOT/HOS creators use raw `driver_id` text | **REAL — NARROWED** | Only **one** file left: `apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx`. The HOS tab already uses `DriverPickerWithCreate`. Scope is one picker swap, not seven. |

## NOT RE-TESTED — 12

Left on the list deliberately. Each needs its own read against current state; none is claimed closed.

LST-F07, LST-F11, LST-F12, LST-F13, LST-F19, LST-F20, LST-F21, LST-F24, LST-GUARD, LST-REGISTRY,
SAF-F03, SAF-F04, SAF-F13, SAF-F16, SAF-F17, SAF-F26.

---

## Net effect on the backlog

- Started: **24** pending blocks in this lane (Lists + Safety).
- **10 written off** — 8 superseded, 2 premise-wrong.
- **2 re-confirmed real** (LST-F26, SAF-F14 — the latter narrowed from 7 files to 1).
- **12 untested**, still counted as open.

**Remaining in this lane: 14.**

The ACCT (29) and BANK (3) families are the money lane and are not assessed here.
