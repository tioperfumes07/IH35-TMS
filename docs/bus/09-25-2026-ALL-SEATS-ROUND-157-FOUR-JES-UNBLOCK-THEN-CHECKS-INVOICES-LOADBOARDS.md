# ROUND 157 — ALL SEATS — THE LAST 4 JEs UNBLOCK EVERY MERGE. THEN CHECKS (CC-2), INVOICES (CC-3), LOAD BOARDS (CC-3), BOOKS (CC-1).
Claude Lead, 09-25-2026 9:10 AM CT (14:10Z). Owner, 9:08 AM CT: "it is as quick books it is what we are cloning... I also need a coder to complete the create checks full engine and connective linkage etc. as well as create invoices confirm will write on all tables etc. and I need my load boards load costs pre settlements etc... all render the same loads always, expenses, transactions etc. coordinate the coders. Get everything done now."

## Measured live 14:05Z (USMCA, bypass on)
- Fuel is CLOSED to the documents (AUTH-010, #22634): 439 lines / 177,173.07; 427 posted; 12 held tour_open (loads 13588, 13600); TB 0.
- The costs guard with the reversed-pair rule (#22625) and the three document-engine exemptions leaves **exactly 4 violations, all `manual_je`**. They are CC-1's reclass JEs moving expenses out of 9000 suspense:
  - b699d2ac (EXP-2026-00053 → 5310, $560.00)
  - 6ff6b8fa (EXP-2026-00050 → 5400, $64.60)
  - 9726b25b (EXP-2026-00021 → 5300, $15.25)
  - 5ebb6624 (EXP-2026-00049 → 5300, $15.25)
- PR #22576 (CC-3 guard scope) is CLOSED; PR #22625 (reversed-pair rule) is OPEN.

## STEP 0 — CC-1, FIRST, deadline 15:00Z. It unblocks every merge.
QuickBooks does not reclassify an expense with a JE. It edits the expense's category. For each of the 4:
1. Void the reclass JE through the void engine.
2. Void the original expense (the one posted to 9000) through the void engine.
3. Recreate it through the expense writer with the correct category/account (5310 / 5400 / 5300 / 5300), the same vendor, date, amount, load, unit, driver and trailer, and post it through the engine.
Proof: 0 `manual_je` cost JEs; 9000 net back to its pre-reclass figure minus these four; TB 0. Next AUTH number, issued before execution. Write "STEP 0 DONE" at the top of NOW-CC-3 and NOW-CC-2 the same minute.

## STEP 1 — CC-3, the minute STEP 0 is done
Put the three document-engine exemptions (factoring_advance, driver_settlement, factoring_default_interest, by source_transaction_type only) into #22625, or reopen #22576 folded in. Guard exit 0 on main → FAST-MERGE. Then FAST-MERGE LAW 5. The coordinator also wakes cc2.

## CC-2 — after your match-engine FAST-MERGE: you now OWN THE CHECK ENGINE, start to finish (replaces Codex)
- Codex merged only #22579 (migration claim) in 5 h. You take R-154 + R-154.1 + R-154.2 **exactly as written on main**, starting from branch `claude/r154-check-migration-claim`:
  - check = `accounting.expenses` payment_type 'check';
  - `banking.check_number_registry` + `check_stock_settings` + persistent print batches;
  - print queue, PDF, void;
  - bill-payment-by-check;
  - all linkage (payee vendor/driver/customer, CoA map only, unit/trailer/driver/load/WO per category, reverse links);
  - `verify-check-engine.mjs` assertions 1–13.
- The check engine is a USMCA transaction per R-156: created = accrual; cash basis after the bank MATCH (check_number exact-match candidate in your own engine).
- 7 PRs, FAST-MERGE each. PRs 1–3 by 20:00Z, all 7 plus Chrome proof by 09-26 08:00Z. Miss → the Lead.

## CC-3 — after LAW 5 merges: the invoice writer and one-source rendering
1. **Invoice create writes every table** (QuickBooks invoice): create one invoice on a **Neon child branch**, never USMCA prod, through the app's own invoice writer. Prove rows in:
   - accounting.invoices and its lines (line haul = contracted total; accessorial items 4200/4210–4240);
   - load link (mdata.loads);
   - customer (mdata.customers);
   - A/R 1100 and the revenue JE through the revrec latch;
   - docs.files (PDF);
   - the factoring link when purchased;
   - the audit row;
   - void → reversal.
   List every table, the row id, and one screenshot per surface. Any table not written = fix the writer in the same PR.
2. **Same loads, same numbers everywhere:** Load Board, Load Detail → Costs, Pre-Settlement, Settlement, Company Settlement, Invoice. Run your six-surface proof script on docs 5769/5790/5803 plus 3 random loads. Every expense/transaction on a load (fuel now included: 439 lines) shows identically on every surface.
Deadline 18:00Z.

## CC-1 — after STEP 0, continue your books job (no switching)
1. Set B (AUTH-009, 18 settlements, escrow).
2. Close the tours for loads 13588 + 13600 through the settlement engine per their documents; post their 12 held fuel expenses.
3. Fill the unit on 141 fuel expenses from the document truck.
4. Then the owner's full list, one type at a time against the settlement documents, with counts and $ per type (app vs documents):
   - loads; driver bills;
   - cash advances (bill payments); tolls/scales/lumper/other expenses;
   - invoice income lines (line haul, accessorials);
   - escrow and every deduction/additional pay;
   - Faro daily purchase / reserve / escrow balances vs `faro_canonical_purchases.csv` + `day_control.json`.
   One table per type at the top of NOW-CC-1.

## CODEX
Stop R-154. It moves to CC-2. Put your current state, and any branch you have, at the top of NOW-CODEX, so CC-2 can pick it up.
