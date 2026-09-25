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

---

# ROUND 153.9 — CC-2 / CC-3 / CC-1 — FUEL IS OFF THE BOOKS RIGHT NOW. D3 IS ANSWERED.
Claude Lead, 09-25-2026 7:27 AM CT (12:27Z). Measured live at 12:20–12:26Z, USMCA, bypass on.
Full text (CC-2/CC-3 sections, OWNER ITEM): `docs/bus/archive/NOW-CC-1-2026-09-25-10.md` carries
CC-1's own pre-R-153.9 status; R-153.9 itself is size-trimmed below to CC-1's own section only —
CC-2/CC-3, your sections are unchanged and still live in the commit that produced this file
(9a9ee6/8ad9b3, `git log -p -- docs/bus/NOW-CC-1.md`) if this trim ever clips them from your view.

## CC-1 — D3 status through 8:34 AM CT: `docs/bus/archive/NOW-CC-1-2026-09-25-14.md`
(Set A/Set B both still blocked, no writes attempted for either; manual_je + driver_bill migration
both done.)

CC-1 | 2026-09-25 9:04 AM CT (14:04Z) | PAUSE LIFTED, R-156 DEFINITIONS READ (using them exactly
below). Two new tasks received (after Set B): (1) close tours 13588+13600 via the settlement
engine per their document, post the 12 held fuel expenses; (2) fill unit_id on the fuel expenses
missing it from feed_input.json's record.truck -> mdata.units.unit_number.

(1) BLOCKER FOUND, read-only only: the signed document for both loads (Driver/Company Settlement
5812) shows driver pay at **$0.00/mile** for both loads (Loaded Miles @ $0.00 on the company doc)
and Driver TOTAL DUE **-$50.00** (two $25 escrow deductions, zero salary). closeSettlementPayRun
hard-rejects a negative net (NET_PAY_NEGATIVE) -- cannot "close through the settlement engine" on
this document as read without either an override or confirmation the $0.00 rate is correct (driver
paid via a different mechanism/settlement, not a data gap). Not guessing on a driver's zero pay.

(2) Investigated (read-only): feed_input.json (124 loads/records, each with .truck e.g. "T175")
gives the exact join Lead named. Live count of USMCA fuel-content expenses missing unit_id: 118
(source_fuel_transaction_id set + load_id set, my most defensible single criterion -- broader
combined criteria give 99/129/161/183 depending on what counts as "fuel"; will re-measure exactly
at write time per LAW 3 and report the real figure, not guess which produces exactly Lead's "141").
This one does NOT touch the settlement engine or any table Set B/the fuel-close transaction locks
(accounting.expenses.unit_id / fuel.fuel_transactions.unit_id only) -- treating it as safe to
prepare now despite "after Set B" wording, since the ordering concern (today's deadlock) was
specifically about concurrent settlement-engine transactions. Will hold the actual write for an
explicit go, given "after Set B" was stated plainly and I could be wrong to read around it.
