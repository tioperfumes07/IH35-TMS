# THE LINKAGE LAW IS SATISFIED IN PRODUCTION. MEASURED, NOT ASSERTED.
Lead · 2026-10-02 · USMCA `5c854333…` · prod `tiny-field-89581227` / `br-fancy-credit-akjnd07a`,
read-only under `app.bypass_rls='lucia'`

## THE QUESTION
§4c of ROUND 332.1: *"Every money writer writes its spine link in the SAME TRANSACTION as its
journal entry."* This morning the invoice half of revenue recognition had **8 spine links for 110
invoices** while loads carried 251. Is the law now actually met in production, or only in the code?

## SPINE COVERAGE BY DOCUMENT CLASS — ALL 12 CLASSES
| source_transaction_type | JEs | lines | with spine link | unlinked | % |
|---|---|---|---|---|---|
| journal_entry | 319 | 775 | 319 | 0 | **100.0** |
| load | 256 | 387 | 256 | 0 | **100.0** |
| fuel_event | 255 | 510 | 255 | 0 | **100.0** |
| driver_settlement | 141 | 420 | 141 | 0 | **100.0** |
| bill | 44 | 96 | 44 | 0 | **100.0** |
| escrow_account | 16 | 32 | 16 | 0 | **100.0** |
| manual_je | 8 | 46 | 8 | 0 | **100.0** |
| customer_payment | 7 | 14 | 7 | 0 | **100.0** |
| bank_reconciliation | 3 | 6 | 3 | 0 | **100.0** |
| driver_cash_advance | 1 | 24 | 1 | 0 | **100.0** |
| invoice | 154 | 183 | 130 | 24 | 84.4 |
| expense | 2,696 | 5,416 | 770 | 1,926 | 28.6 |

Two classes are not at 100%. The next query decides whether that is a live defect or dead rows.

## THE DECIDING CROSS-TAB — DOCUMENT STILL EXISTS? × HAS A SPINE LINK?
| class | document exists | has spine link | JEs |
|---|---|---|---|
| expense | yes | **yes** | 770 |
| expense | **no (deleted)** | no | **1,926** |
| expense | yes | **no** | **0** |
| invoice | yes | **yes** | 106 |
| invoice | **no (deleted)** | no | **24** |
| invoice | **no (deleted)** | yes | **24** |
| invoice | yes | **no** | **0** |

> ## ZERO. There is not one journal entry in USMCA, in any document class, whose document still
> exists and which has no spine link.

Every unlinked entry is an **orphan** — a posting whose document the 2026-09-30 purge deleted.
1,926 expense + 24 + 24 invoice = **1,974**, which is exactly the orphan population CC-1 found and
I independently re-measured. The linkage gap and the orphan gap are **the same rows**.

## WHAT THAT MEANS
1. **The linkage law is met in production today.** Every live money document declares its linkage
   on `accounting.transaction_source_links`, in all 12 classes. 100% with no exceptions.
2. **The hole I found this morning is closed.** invoice/source_transaction went from **8 links for
   110 invoices** to **106 of 106 live invoices linked**. CC-1's #24256 (poster writes the link in
   the same transaction, plus the backfill) did what it was ordered to do, verified at row level
   rather than taken on trust.
3. **CC-2's #24238 and #24259 hold up.** Factoring writers declare linkage; the two writers it
   caught in its own merged work are fixed.
4. **AUTH-205 is now a two-for-one.** Removing the 1,974 orphans does not merely fix the A/P
   variance of $2,976.63 — it takes spine coverage to a literal **100.0% on every class with zero
   residual**, because the orphans are the only unlinked rows left.

## THE ONE CAVEAT I AM NOT GLOSSING
This measures what is **in** the ledger, not what a future writer will do. Row-level compliance
today and a guard that keeps it are different things. The guards that hold this line are
`verify-invoice-issue-implies-posted-and-linked` (CC-1, now verify-step 12297),
`verify-factoring-writers-write-the-spine` (CC-2) and `verify-money-engine-linkage` (mine, already
in the gate). A new money writer outside all three would still be able to post without declaring
linkage — that is the remaining hole, and it is a guard-coverage question, not a data question.

## REMAINING
- Generalize to one guard asserting that **every** writer of `journal_entry_postings` — not just
  invoice and factoring writers — calls `writeTransactionSourceLink` in the same transaction. Three
  guards covering three families is three chances to miss the fourth.
- AUTH-205 clears the 1,974 and the figures above become 100.0% / 0 unlinked across the board.
