# OWNER REWRITE — Dispatch board + Cascade Void + all-seat orders
**2026-09-01 · Cursor lead · live `8112092`**

---

## WHERE IS THE CASCADE VOID DESIGN?

**File (on `main`, PR #19053):**  
[`docs/bus/CASCADE-VOID-DESIGN-FOR-OWNER-2026-09-01.md`](./CASCADE-VOID-DESIGN-FOR-OWNER-2026-09-01.md)

Also on your machine after pull:  
`/tmp/ih35-main-sb/docs/bus/CASCADE-VOID-DESIGN-FOR-OWNER-2026-09-01.md`

It covers: dependency MUST/MAY map · dialog · FK execution order · pre-validation · proforma vs invoice · one CC-1 API (no second graph).

**Status: DESIGN ONLY — no Cascade Void code until you reply APPROVED or CHANGES on that file.**

That is exactly the “design and wire and link … from right now” ask: design first so you do not discover gaps one refuse-message at a time.

---

## YOUR DISPATCH BOARD WORDS — REWRITTEN (nothing dropped)

| You said | Instruction |
|----------|-------------|
| Keep pickup city + delivery city | **KEEP** those columns |
| Also need PU date, DEL date, PU time, DEL time | **ADD** four columns from `mdata.load_stops` (`appointment_*` / `scheduled_*` / `actual_*`). Show window **and** APPOINTMENT vs FCFS |
| Columns movable | Drag-reorder columns (CC-3 COLUMN LAW — Cursor consumes tokens, does not invent a third scale) |
| Headers asc/desc | Every header sortable both ways |
| Proper filters + search true data | Real filters; search hits real fields (load #, customer, cities, dates, status, amounts) — not junk / not cluster-only |
| Board is junk because it is cluster / history | **LIVE LOADS ONLY** on the board (awaiting assignment, booked, in transit, in shop, etc.). **Completed + cancelled → LOADS HISTORY** tab/section with date-range filter. Board is for trucks today (why it carries HOS) |
| Each section own headers | Each board section keeps its own headers, own sort, own filters |

**Owner:** CURSOR builds board (after Cascade Void design approval OR in parallel only for non-void board chrome if you order). **CC-3** posts UI CONTROL LAW token table + movable-column primitive.

---

## MULTI-SELECT VOID — HONEST STATUS

| Surface | What exists live now | Why it feels “missing” |
|---------|----------------------|-------------------------|
| Accounting (invoices/bills/expenses/payments) | Multi-select + **Void** | Working |
| Settlements | Multi-select + **`Reverse N selected`** | Not labeled **Void** |
| Loads | Multi-select + **`Cancel loads`** | Not labeled **Void**; cancel refuses if bill still live |

Your refuse when the bill was not voided = **correct control, wrong UX**. That is exactly what **Cascade Void** fixes: one place, shows bills/settlements/etc., voids related docs together after you confirm once.

Until you **APPROVE** the design, Cursor will not fake a “Void” that skips the tree (that recreates the 0-of-11 class).

**Immediate:** hard-refresh app on live `8112092`. Settlements = select rows → **Reverse**. Loads = select → **Cancel loads**. Accounting lists = **Void**.

---

## → PASTE TO ALL SEATS

```
ALL SEATS — OWNER REWRITE 2026-09-01. Read YOUR block. Do not work ahead of Phase plan.

CASCADE VOID DESIGN (owner review): docs/bus/CASCADE-VOID-DESIGN-FOR-OWNER-2026-09-01.md
No Cascade Void product code until Jorge replies APPROVED/CHANGES on that file.

CURSOR
  1. Wait for APPROVED on Cascade Void design — then build UI against CC-1 void-tree API only.
  2. DISPATCH BOARD (owner words, no drop):
     - KEEP pickup city + delivery city
     - ADD pickup date, pickup time, delivery date, delivery time (+ appointment vs FCFS)
     - LIVE loads only; completed/cancelled → LOADS HISTORY tab with date range
     - Per-section headers / sort / filters
     - Movable columns + sortable headers + real filters + search that hits true data
     - Consume CC-3 UI CONTROL LAW tokens — no third scale
  3. Do NOT invent a second dependency graph. Tree = CC-1 API.
  4. Unit deactivation + permission wiring remain queued (report evidence).

CC-1
  1. is_sample_data on reversals + backfill 233 (blocks purge)
  2. categorization_recover_from_driver — prove THROUGH THE HTTP ROUTE
  3. GET void-tree API (MUST/MAY/can_void/block_reason) — Cursor Cascade Void consumes ONLY this
  4. LINKAGE INTEGRITY LAW (banking.matches + triggers + one void column)
  5. Money queue (driver bills, expense #, settlement approval, PAID, …)
  6. Dispatcher confirmation (5.5) behind money chain

CC-2
  1. Land push / stop if worktree blocker — OUTBOX it
  2. Band B3–B10 control-account checks
  3. Trial-balance-unchanged-across-purge guard

CC-3
  1. INSURANCE P0 ahead of UI tokens (COI/ID per unit; policies; values; evidence IDs)
  2. Then post UI CONTROL LAW token table + movable column / sort primitives for Cursor board

DEVIN-A
  Innocent-name test contamination via GL trail — report only, delete nothing

CASCADE
  Full is_sample_data purge enum + JE original/reversal pairs in FK order — CC-1 executes your list

CODEX
  Run eight conditions; only you lift freeze. Driver-person-identity continues.
```

---

## What Jorge must do once

Reply on Cascade Void design: **APPROVED** or **CHANGES: …**  
Then Cursor builds. Until then, use Reverse / Cancel / accounting Void for Phase 2 clearing.
