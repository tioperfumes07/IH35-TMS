# SEED IN BULK, NEVER ROW BY ROW — OWNER LAW 2026-09-28

**Status:** BINDING. Every seat. Every backfill.

Owner, verbatim: **"all data must be seeded instantly and fast, not one by one."**

Canonical always-apply rule: `.cursor/rules/53-seed-in-bulk-never-row-by-row.mdc`  
Guard: `scripts/verify-seed-in-bulk-never-row-by-row.mjs`  
Registry: `docs/law/LAW.json` → `LAW-2026-09-28-SEED-IN-BULK-NEVER-ROW-BY-ROW`

## The rule

Every seed, backfill, parse and correction is **set-based** and runs in **one transaction per
batch**. No per-row HTTP. No `for (const row of rows) await api.create(row)`. No loop issuing one
INSERT per record when a set-based write exists.

## How

1. Parse the whole document into memory first; validate the whole set; then write.
2. Set-based SQL: `INSERT ... SELECT` · `UPDATE ... FROM (VALUES ...) AS v(...)` · `COPY` above a
   few thousand rows.
3. One transaction per batch — all-or-nothing. Partial seed is worse than no seed.
4. Batch 500–2000 rows. Report rows/second.
5. Validate before writing. On failure, report every failing row at once — not the first one.

## Speed never buys wrong money

Money still posts through the sanctioned engine. No hand-written JEs/postings for speed. If the
engine is per-document, batch the calls in one transaction on a reused connection; do not invent
GL math. When speed and correct accounting conflict, **accounting wins**.

Reconciles with Rule 52: Faro feed stays app-path / purchase-day composition. The Cursor
application of this law for Faro 09-22..09-25 is **one transaction per day**, not per invoice —
not a licence to raw-INSERT accounting rows.

## Owner-named lanes (2026-09-28)

| Seat | Immediate application |
|------|------------------------|
| CC-2 | Remaining settlement-line qty/rate in ONE `UPDATE ... FROM (VALUES ...)`; 5817/5818/5819 same |
| CC-1 | AlwaysTrack unit/trailer/driver/customer/W.O. — ONE statement; mileage across loads — ONE; driver-bill re-mint — one batched engine txn |
| CC-3 | Same law on any migration shipped |
| Cursor | Match candidates over bank lines set-based; Faro 09-22..09-25 one txn per day |

## Proof required on every seed report

`rows written · batches · seconds · rows/second · single transaction per batch`

A seed report without a rate is not a report.
