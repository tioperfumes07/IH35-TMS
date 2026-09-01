# CREATE TEST THEN VOID (owner-locked 2026-08-22 — PERMANENT)

> **SUPERSEDED (seat-created prod financial fixtures — owner 2026-09-01):** For **any seat-created money row in production**, `docs/lockdown/NO-SEAT-PROD-FINANCIAL-FIXTURES-LAW-2026-09-01.md` **wins**. Pattern: **owner-ordered walk manifest only** · **create→prove→void same session** · report record + reversing JE · **no standing fixtures**. Empty TMS tables still expected. “Keep TEST on the books / do not void until launch” **does not** authorize seats to leave prod financial contamination.

**Owner word:** create labeled **TEST** documents through the live wizards so the software can be proven. When the software is operational 100%, those tests are **voided** (reversal / WORM). Do not wait for “real” operational volume. Do not tell the owner the ledger is empty as if that were a coder stop.

**Answered = closed.** Do not re-ask. Do not spend a session reporting the same empty/disabled story.

## The law

1. **ALL TMS-native rows are TEST** until the owner says otherwise. An empty TMS table is **expected**, not a certify FAIL and **not** a reason to stop Live Chrome.
2. **Create the test.** Item 2 of Fully-Wired (create→canonical) is proven by **saving a labeled TEST row** (bill, expense, invoice, JE, bill payment, load, etc.) and **reloading**. Placeholders: `$1,200` / `$1.20/mi` / `$0.05` or the remaining unpaid amount on an existing TEST bill — always labeled **TEST DATA** in memo/reference.
3. **Keep on the books (owner 2026-08-27 + 2026-08-28).** **All seats have permission** to create labeled TEST / sample vendors, customers, loads, bills, expenses, invoices, catalog rows, and whatever the wizard needs. **Do not void-all-TEST.** Voiding the corpus mid-sprint empties tables (regression) and is double work. Reuse existing TEST rows. **Void is allowed only** to **test void/reversal** or when a document **must** be voided (duplicate / wrong entity / operator error). There is **no void freeze** that blocks WORM reverse of a posting defect. Void by UUID; never DELETE financial rows.  
   **Owner 2026-08-28:** keep the rows; **G1** = the label must actually set `is_sample_data`; **exclude `is_sample_data` from every financial report** (trial balance, P&L, balance sheet, cash flow, register). Counting unlabeled TEST money in the TB is the defect — not keeping the regression corpus. Cutover $0 opening balances / negative TEST bank are **not** defects (`PARALLEL-BOOKS-CUTOVER-LOCKED-2026-07-16.md`).
4. **Disabled chrome is not a stop** until you have:
   - selected the required picker row (e.g. unpaid bill → then **+ Record Bill Payment** enables), **or**
   - created the missing TEST document so the picker has a row, **or**
   - proven a real code/API defect (error, 500, silent no-op).
5. **Forbidden reports (every session):** “cannot certify because 0 payments / buttons disabled / no transactions” **without** first creating the TEST hop in that same session.
6. **No TMS→QBO write-back.** TEST creates stay in the TMS. USMCA TMS is authoritative.
7. **One module until leftover dry** when the owner asks to certify a module: every seat works **that module’s** create / picker / reverse / money leftover — not a parallel “next module” while Accounting Live Chrome is unfinished.
8. **Banking ledger hops (owner 2026-08-22):** create labeled TEST **expenses**, **match** to bank lines, **reconcile**, and **test the ledger**. This is how Banking is proven. Do not treat For-review as “hands off.” **Do not void until launch.** Canonical reminder: `docs/lockdown/USMCA-LAUNCH-FIRST-STANDING-LAW-2026-08-22.md`.

## Companion

`docs/specs/STANDING-SESSION-DIRECTIVE.md` §7 · `docs/lockdown/FULLY-WIRED-COMPLETE-BAR-2026-08-13.md` item 2 + 12 · WORM / void-not-delete.
