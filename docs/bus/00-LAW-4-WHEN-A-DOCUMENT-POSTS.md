# LAW 4 — WHEN A DOCUMENT POSTS
Claude Lead, 2026-09-23 10:06 PM CT (2026-09-24 03:06Z). Binding on every seat.
Supersedes anything in ROUND 145 that stated a single posting path.

## THREE DATES. NEVER COLLAPSED.
- **DATE ONE — INCURRED.** The cost posts here, at creation, on accrual.
  - BILL: `DR expense/COGS  CR ACCOUNTS PAYABLE`. The bank is not involved.
  - EXPENSE: `DR expense/COGS  CR the CARD or bank it was actually paid on`.
  - This date hits load margin, the settlement and the P&L.
- **DATE TWO — DUE.** Cash-flow forecast and A/P aging only. **NO POSTING.**
- **DATE THREE — CLEARED.** The BILL PAYMENT posts `DR ACCOUNTS PAYABLE  CR BANK`.
  The only date that touches the bank. The date reconciliation uses. Never touches load margin.

## TWO ENTRY POINTS INTO BANKING. ONE POSTING EACH. NEVER BOTH FOR THE SAME MONEY.
- **A. DOCUMENT-FIRST -> MATCH.** The document already posted at DATE ONE. Accepting a match
  **LINKS AND CLEARS**. It **POSTS NOTHING**. Permitted writes: match/clear state, who and when,
  and a genuine variance leg alone.
  *If accepting a match ever creates a cost JE for an already-posted document, that is a defect.
  The P&L doubles and the ledger still balances, so nothing else catches it.*
- **B. BANK-FIRST -> CATEGORIZE.** A bank line with no document behind it. Categorizing creates the
  posting there: `DR chosen account  CR bank`, at the bank date. The only place Banking books a cost.
  A split is N lines, ONE bank line, ONE journal entry, each line with its own account and linkage.
  Cannot save unbalanced.

## SUGGEST-ONLY, PERMANENT
The system SUGGESTS. A HUMAN decides. Every write records who and when. No job, hook, importer,
migration or scheduled task writes `matched_*` or `categorization_*`. No "apply all suggestions" that
writes more than one row per human decision.

## THE ONE THING THAT MUST NEVER HAPPEN
The same money on the load twice - once when the document was entered and again when it was paid or
matched. The cost is recognised **exactly once**, at DATE ONE. Payment clears a liability. Matching
clears a bank line. Neither is a cost.

## FUEL, APPLYING THE ABOVE
`fuel.fuel_transactions` is the OPERATIONAL record and **never posts**.
`accounting.expenses` is the ACCOUNTING record: posts once at DATE ONE with the real card as the
credit side, and inherits every link from its load - `load_id`, `driver_uuid`, `unit_id`,
`trailer_id`, `vendor_uuid`, plus `source_fuel_transaction_id`. Then MATCHED in Banking, which
clears and does not post.
