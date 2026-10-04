# CC-1 → Lead — the 1150 writer, named. No write done. Plus the orphan purge dry run. (2026-10-04 ~19:50Z)

## 1. The $89,469.00 on 1150 is NOT a misstatement — my detector summed by source type and caught one side of a pair
Traced read-only on prod, USMCA. Sample invoice `317da69a…` (load 13539):
```
JE 22c5daed  Revrec Event 2 bill — load 13539   2026-08-23
   Cr 1150  4,860.00   source=load     reversed_by 4798cdd7
   Dr 1100  4,860.00   source=invoice  reversed_by dde0a0b4
JE 265ecf5d  Void reversal of invoice 317da69a…  2026-08-23
   Cr 1100  4,860.00   source=invoice  reversal_of 06956b71
   Dr 1150  4,860.00   source=invoice  reversal_of fd4a39e1   <- the 1150 leg WAS reversed, but RELABELED load -> invoice
```
All 24 chains (48 entries), whole entries:
```
1100 invoice 48 lines net 0 · 1150 invoice 24 lines net +8,946,900 · 1150 load 24 lines net -8,946,900  => 1150 nets 0
unreversed non-reversal lines in those 48 entries: 0
```
**Every leg was reversed; nothing was partially reversed.** `verify-no-orphaned-gl --live` summed only the lines sourced `invoice`, which is 3 of each chain's 4 lines. That is my guard's defect: it will net whole entries, not one source type. The 963-expense set checked the same way: 1,926 entries, 0 accounts non-zero, 0 live lines.

## 2. The writer — a real defect, but a labeling one, not money
**`postVoidReversal` (`apps/backend/src/accounting/void.service.ts`)** writes EVERY reversal line with the voided document's own `source_transaction_type/id` (`trueType`/`trueId`). **`flipPostingsForReversal`** drops each original line's own source.

An Event-2 entry carries a `load`-sourced 1150 leg and an `invoice`-sourced A/R leg. Voided through its invoice, the reversal of the 1150 leg comes out labeled `invoice`. The GL balances, but the per-source view does not:
- the load's `load`-sourced GL shows an unbilled-revenue credit with no reversal under its own source;
- the invoice's GL shows a 1150 debit it never posted.

Anything that reads GL by source (load profitability, unbilled-by-load, per-document drill, my detector) reads it wrong.

**PROPOSED FIX (A-tier, waiting for your go):**
- `flipPostingsForReversal` carries each original line's `source_transaction_type/id`.
- `postVoidReversal` writes each reversal line with ITS original's source, or refuses if the writer cannot.
- Guard + selftest: plant a two-sided document with mixed-source legs and assert that every leg reverses AND each reversal line carries its own original's source.
- Fix `verify-no-orphaned-gl --live` to net whole entries.

**History:** the existing 24 relabeled lines are WORM and correctly balanced. Recommend leaving them and letting the orphan purge below remove them with their chains.

## 3. Orphan purge dry run — `--scope=orphan-postings` (prod read-only)
```
PLAN: journal_entries 2,035 · journal_entry_postings 4,078 · transaction_source_links 194 · load_revenue_recognition_postings 24
LEDGER before DR 218234625 = CR 218234625, 0 unbalanced; removed DR 36249509 = CR 36249509
EFFECT: 2000 A/P -297663 · 9000 +297663 · 1000 BofA -100 (BANK) · 5400 +100 — every other account nets 0
BLOCKER: only the $1.00 bank effect (ALLOW_BANK_EFFECT under the AUTH)
```
That is one run covering the AUTH-397 whole chain (the originals and middle entries are expense-sourced orphans; the double reversals come in as reversal partners), the 963 expenses, and the 24 invoice chains (+24 inactive revrec latch rows). The GL effect is exactly AUTH-397's.

## NEEDED BEFORE ANY WRITE
1. **An AUTH number.** The engine and `_system.purge_authorized_rows` require `^AUTH-[0-9]+$`; "AUTH-397-UNWIND" does not match. Name it (e.g. **AUTH-397**) and say it covers this plan: 2,035 entries, bank effect $1.00.
2. **Invoice chains IN or OUT** of the purge. They net 0, so nothing is left to unwind on 1150.
3. **GO on the §2 writer fix.**

Then: fork rehearsal (APPLY, rolled back) → paste → prod APPLY → re-measure (`verify-no-reversal-of-a-reversal --live` 0, `verify-no-orphaned-gl --live` 0) → paste → both join the money gate.
