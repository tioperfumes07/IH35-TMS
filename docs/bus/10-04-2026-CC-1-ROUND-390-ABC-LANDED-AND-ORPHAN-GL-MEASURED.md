# CC-1 → Lead — ROUND 390 (a)/(b)/(c) landed (#25374, ACCT-F9979) + the orphan GL measured on prod (2026-10-04)

## Landed (applies on the next backend deploy)
- **(b), database:** migration `202615410100` adds `accounting.refuse_document_delete_leaving_gl()`.
  - It is SECURITY DEFINER (RLS-immune), attached as a **deferred constraint trigger** on the 8 document tables: expenses, invoices, bills, bill_payments, payments, driver_settlements, loads, factoring_advances.
  - A transaction that deletes a document while any posting line still names it is refused at COMMIT with `IH35_DOCUMENT_DELETE_LEAVES_GL`, whatever the delete order.
- **(a), engine:** a planned document with LIVE lines is a BLOCKER ("reverse (void) first"). The WORM arm already admits only voided documents.
- **(b), engine:** a planned document whose lines are not all planned is a BLOCKER. After its deletes, in the same transaction, the engine proves no line names a removed document; otherwise it rolls back.
- **(c), guard:** `verify-no-orphaned-gl`, step 18093.
  - The selftest plants 3 orphans against the pure plan check; no data is written. It also plants 5 source defects.
  - `--live` checks that the trigger is on all 8 tables and that no USMCA line names a removed document.

**Fork rehearsal** (br-soft-term-akqk20qe, one transaction, ROLLED BACK):
```
DELETE voided expense 813cc18d alone      -> IH35_DOCUMENT_DELETE_LEAVES_GL accounting.expenses 813cc18d…: 6 posting line(s) still name this document (0 live, unreversed)
DELETE it WITH its 6 lines + source links -> constraint passes
```

## What `--live` measured on prod (read-only), USMCA
```
accounting.expenses: 3,860 posting lines name 963 expenses that no longer exist — all reversed pairs, net $0.00
accounting.invoices:    72 posting lines name  24 invoices that no longer exist — 1150 Unbilled Revenue NET +$89,469.00 (A/R 1100 nets 0)
                        entry dates 2026-07-29 .. 2026-08-23
```
**The $89,469.00 is a live balance-sheet misstatement.** 1150 Unbilled Revenue carries a debit for 24 invoices that are gone. Their A/R side was reversed, but the unbilled side was never relieved. It is not part of the AUTH-397 population.

## RULINGS NEEDED
1. **AUTH-397-UNWIND:** CHAIN vs 61-ONLY (see `10-04-2026-CC-1-AUTH-397-UNWIND-DRY-RUN-AND-RULING-NEEDED.md`). CHAIN is recommended.
2. **The 963 expense orphans** (net $0): remove them through the engine (`--scope=orphan-postings`, dry run first), under an AUTH?
3. **The 24 invoice orphans / 1150 +$89,469.00:** what is the right end state? Reverse the unbilled leg (relieve 1150 against revenue?), or purge the chains? This is the owner's money call. I will dry-run whichever you rule.

`verify-no-orphaned-gl --live` joins the money gate once 1–3 land and the trigger is deployed.
