# ROUND 361 — LOAD LINEAGE — THE MEASURE (posted before any migration) — CC-3, 2026-10-03

Lead order: every reversal and document traces back to the load that created it, both directions.
Measure first, post the table here, never guess a load, no new lineage table.

**How measured:** prod `br-fancy-credit-akjnd07a`, **direct** endpoint (never the pooler — see #24584),
`BEGIN READ ONLY; SET LOCAL ROLE NONE; SET LOCAL app.bypass_rls='lucia'`, **unscoped** (no company
filter), `current_user = ih35_ci_readonly`. 11,514 postings visible. Read-only; nothing written.

Hops today: posting → document is the spine (`source_transaction_type/id` + `transaction_source_links`);
reversal → original is `journal_entry_postings.reversal_of_line_id`; document → load is the document's
own `load_id` / `source_load_id`. **No posting carries a load.**

## A. Reversals — walk back from the reversal alone

Every reversal line, by source type. The original line always still exists (original_gone 0 in all rows).

| source | reversal lines | source document still exists | document gone (purged) | doc→load works today |
|---|---:|---:|---:|---:|
| expense | 2,154 | 224 | **1,930** | 224 |
| journal_entry | 775 | n/a (the JE is the document) | 0 | 0, not load-born |
| fuel_event | 96 | 0 | **96** | 0 |
| invoice | 52 | 4 | **48** | 2 |
| load | 6 | 6 | 0 | 6 |
| bank_reconciliation | 2 | n/a | 0 | 0, not load-born |

**2,074 reversal lines are orphaned from their load today:** the document both the reversal and its
original point at was deleted (AUTH-177 purge and earlier), so the chain stops one hop short.
1,930 of the 2,154 expense reversals also have no `transaction_source_links` row; 48 of 52 invoice
reversals have none (the 48 already named in migration 202615330906).

**Is the load provable for the orphans?** From the deleted document's own `audit.row_changes` DELETE
before-image (`old_data->>'load_id'` / `'source_load_id'`):

| source | lines | documents | DELETE audited | load proven from before-image | NO provable load → stays NULL, reported |
|---|---:|---:|---:|---:|---:|
| expense | 1,930 | 963 | 1,930 | **1,912** (954 docs → 106 loads, all 954 loads still exist) | **18** (9 docs) |
| fuel_event | 96 | 48 | **0** | 0 | **96** (48 fuel rows deleted with no audit row; spine still links the `fuel_event` id, which resolves to nothing) |
| invoice | 48 | 24 | 48 | **48** (24 docs → 24 loads, all exist) | 0 |

No expense document split across two loads (line-level multi-load = 0), so nothing had to be chosen.

## B. Documents — load-born documents written with NULL load

Unscoped census. The large NULL counts are the frozen TRANSPORTATION / QBO mirror (`b49a737b…`,
`91e0bf0a…`: 13,051 + 3,196 bills, 27,070 expenses, 11,976 `qbo_clone` invoices). Those are not
load-born documents and are not counted below. Load-born rows only:

| table | rows | NULL load | detail |
|---|---:|---:|---|
| `accounting.load_revenue_recognition_postings` | 253 | 0 | clean |
| `driver_finance.driver_bills` | 140 | 0 | clean |
| `dispatch.load_charge_lines` | 284 | 0 | (136 have no company and 132 point at deleted loads: CC-1 debt, not lineage) |
| `driver_finance.driver_advances` | 12 | 0 | clean |
| `accounting.invoices`, `invoice_type='from_load'`, USMCA | 111 | **1** | invoice **010**, sent, $4,000.00, created 2026-09-30, no load provable from the row: **reported, not stamped** |
| `accounting.invoices`, `from_load`, TRANSPORTATION | 2 | 2 | frozen entity: reported only |
| `accounting.bills`, USMCA driver bills | 93 bills | **22** | bills 13502 13503 13507 13509 13512 13513 13514 13516 13517 13518 13524 13525 13542 13554 13570 13576 13579 13580 13589 13594 13597 13601, all paid. **Provable:** bill_number = exactly one USMCA load_number (owner: "bills are numbered exactly as loads") **and** bill.driver_id is that load's assigned driver: **22 of 22, 0 differ** |
| `accounting.bills`, USMCA, no driver, no number | — | 3 | unpaid $250.00 / $269.10 / $47.25: not provably load-born, reported |
| `accounting.expenses`, USMCA | 553 | 1 | `101e4ac4…`, 2026-10-01, no line carries a load: reported |
| `driver_finance.settlement_lines`, USMCA | 355 | 3 | all on settlement `ae0db193…`: "Admin fee", "I-94 Permit" (deductions), "Scale Expense (LOVES inv 1142716)" (reimbursement). No load on any source: reported |
| `fuel.fuel_transactions` | 1,954 | 1,631 | fuel is card-born, not load-born; out of scope here (the relink issue is CC-2's) |

**The guard today:** no load-born table refuses a NULL load. Every `load_id` column listed is nullable.

## C. The build, after this post (no new table)

1. **Document → load at creation, refused in the database.** A CHECK (NOT VALID, then VALIDATE once the
   reported rows are dealt with) on the load-born kinds only: `invoices` where `invoice_type='from_load'`
   needs `source_load_id`; driver bills (`bills.driver_id IS NOT NULL` and the bill is a load bill) need
   `load_id`; `driver_bills`, `load_revenue_recognition_postings` and `load_charge_lines` get `load_id NOT NULL`
   (all clean today).
2. **Reversal → original + original's load.** The original is already a column (`reversal_of_line_id`).
   The load becomes a column **on the posting**: `journal_entry_postings.load_id`, written by the poster in
   the same transaction from the document. A reversal copies its original's `load_id`, so purging the
   document never orphans it. Under the KILL-THE-SECOND-SYSTEM law: "operational detail … load, unit,
   driver, trailer … lives as columns on the transaction". This is not a lineage table and not a balance.
3. **Backfill only what is proven:** 1,912 + 48 reversal lines (and their originals) from the audited
   DELETE before-images; 22 driver bills by number + driver. **18 expense + 96 fuel reversal lines,
   invoice 010, 3 bills, 1 expense, 3 settlement lines stay NULL and stay on this report.**
4. **Guard** `verify-every-reversal-reaches-its-load`: unscoped; every reversal line → original → load in
   one hop off the posting; every load-born document carries its load; the NULL list is committed and
   shrink-only, ceiling 0.
5. **Finish test (pasted on the PR):** from a reversal id alone → original → load; from a load → every
   document, posting and reversal.

**Lane:** step 2 adds a column to `accounting.journal_entry_postings` and touches the posters (CC-1 GL
lane). CC-3 needs the Lead's LANE_CROSS for it, or CC-1 takes step 2 and CC-3 takes 1, 3 (documents),
4 and 5.
