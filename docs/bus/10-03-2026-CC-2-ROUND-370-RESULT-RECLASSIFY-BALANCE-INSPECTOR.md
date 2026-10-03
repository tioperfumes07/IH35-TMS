# CC-2 — ROUND 368.1 / 370 RESULT — THE RECLASSIFY BALANCE INSPECTOR

2026-10-03. Measured on the DIRECT endpoint, USMCA only (TRANSPORTATION and TRUCKING frozen, not read).

## What ships
- **The whole chart of accounts** — all 217 USMCA accounts: Profit & Loss 66 · Balance Sheet 147 · Statistical 4;
  181 at 0.00 activity shown; 43 inactive behind an explicit toggle, labelled. Hierarchy as hierarchy: each parent's own
  balance, with its rolled-up total beside it. Pane width from the longest live account name (59 characters).
- **Balances derived from the GL postings** with exactly `fn_account_balances_as_of`'s predicate. No stored total read.
  `catalogs.accounts.opening_balance_*`: 0 of 217 non-zero; 0 non-zero without `opening_balance_as_of`; never added.
- **Clicking an account loads every transaction behind its balance** (Round 370 cause 1).
- **The list IS the balance** (Round 370 cause 2): reversed / reversal lines are listed, labelled, and refused at apply
  with the reason on the row — never hidden. A line under the grid says "opening + listed = balance" or, if they ever
  disagree, says so in red.
- **Every column sorts** both ways (server-side). **Everything clickable**: date, number, debit, credit and amount open
  the document (each type to its own page, not a bare JE); name, item, account and load open their own records.
- **Selectors**: by account (tree / filter), by item, by load (filters feeding the same selection).
- **"Could not read"** and **"No transactions in this period"** are different sentences.
- **Spine links (ROUND 373)**: every reclassify entry's postings and every undo entry's postings link to the source
  document and to the batch, in the same transaction. `recon-worklist.service.ts` already links (CC-3's release path).
- **Expenses could not be reclassified at all**: `trg_expense_lines_posted_money_immutable` (202615170700) refused every
  account change on a posted line, including the engine's. Migration 202615360800: an AMOUNT change on a posted line is
  still always refused; an ACCOUNT change is allowed only when, at COMMIT, a reclassify batch line proves a live
  reclassification entry moved the ledger with it (or its undo entry moved it back).

## Proof, pasted
```
TREE: 217 accounts {"balance_sheet":147,"profit_and_loss":66,"statistical":4}; at 0.00 activity 181; inactive 43; longest name 59 chars
9000 Ask My Accountant: tree activity 2837.33 | list 176 rows sum 2837.33 | tree closing 2976.63 = list closing 2976.63 | reversed/reversal rows 176 | AGREE
1000 Bank of America - Operating (USMCA): tree activity 158962.10 | list 470 rows sum 158962.10 | tree closing 152394.11 = list closing 152394.11 | reversed/reversal rows 351 | AGREE
5400 Truck Repairs & Maintenance: tree activity 126.24 | list 19 rows sum 126.24 | tree closing 743.41 = list closing 743.41 | reversed/reversal rows 15 | AGREE
1005 Petty Cash: tree activity 0.00 | list 4 rows sum 0.00 | tree closing 0.00 = list closing 0.00 | reversed/reversal rows 2 | AGREE
EVERY ACCOUNT WITH ACTIVITY: 46 of 46 agree on count AND sum
SORT amount asc: -1287.35, -560.00, -531.26 | desc: 166743.94, 1287.35, 531.26
RESULT: PASS

subject: posting 68c18bbb-5c25-46b8-b0b4-cff55d8b0d58 expense 13589-14 24.99 on 5400 -> 5600 Truck Insurance
before: 5400 743.41 | 5600 0.00
apply: {"applied":1,"refused":0,"docs":[{"updated":true,"note":null,"refusal":null,"je":"9e810bc4-7c86-4a02-8f2b-4dc43fd57806"}]}
after:  5400 718.42 | 5600 24.99
reclass JE 9e810bc4-7c86-4a02-8f2b-4dc43fd57806 postings without a spine link: 0
document line account now: TARGET (document follows the ledger)
undo: 5400 743.41 | 5600 0.00 | undo JE postings without a spine link: 0
RESULT: PASS

recode a posted line's account with no reclass entry: REFUSED — 23514 accounting.expense_lines 978066ac-13c1-48a7-9198-974948a76a64: the account of a line under a live journal entry changed with no reclassification entry
change a posted line's amount: REFUSED — 23514 accounting.expense_lines 978066ac-13c1-48a7-9198-974948a76a64: the amount of a line under a live journal entry cannot change -- reverse and reissue th
RESULT: PASS
```
(proof 1 read-only on production; proof 2 and 3 on fork br-divine-night-ak6uvh5v after APPLY 202615360800 with the real runner)

## 9000 Ask My Accountant — the number and the cause (not special-cased in the UI)
Period activity 2,837.33; closing 2,976.63. 176 lines, every one reversal-related. The chain:
1. 60 expense entries posted Dr 9000 / Cr 2000 A/P;
2. 2026-09-25 a bulk action reversed them (Dr 2000 / Cr 9000) — their source expenses are VOIDED;
3. 2026-09-29 **AUTH-138** (`apps/backend/scripts/ops-defect3-reverse-orphaned-9000-ap-plug.mts`) treated those
   reversals as orphaned plugs and **reversed the reversals** — re-recognising 60 voided expenses on 9000 and on A/P.
That is a double reversal (the 13515 class). The 2,976.63 on 9000 (and the matching A/P credit) is phantom. The fix is
an owner AUTH: reverse AUTH-138's 60 reversal entries. Not written by hand.
