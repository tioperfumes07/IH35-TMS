# ALL CODERS — ROUND 336 · OWNER RULING: EDIT DOCUMENTS, QUICKBOOKS-STYLE, OWNER + ADMIN ONLY
Laredo 2026-10-02 · Owner ruling, Lead engine requirements. CC-1 owns the money side, Cursor the
permission + UI side, CC-2 the factored-invoice interaction.

## THE OWNER'S RULING, VERBATIM IN SUBSTANCE
> "IF I OVERBILLED THE INVOICE SHOULD BE ABLE TO BE EDITED. THERE IS NO ISSUES, IT SHOULD FUNCTION
> LIKE QUICKBOOKS, EDIT BILLS EXPENSE INVOICES ETC, BUT ONLY OWNER AND ADMIN USERS."

**Invoices, bills and expenses are EDITABLE. Owner and Admin roles only.** This is correct and it is
how QuickBooks has always worked. Build it. Do not propose void-and-reissue as a substitute — the
owner asked for edit and edit is the right answer for a correction.

## THE SEVEN ENGINE RULES THAT MAKE AN EDIT SAFE
An edit is not a field update. It is a re-posting event. Every one of these is mandatory.

**1 · THE EDIT AND THE RE-POST ARE ONE TRANSACTION.**
Changing an amount reverses the existing journal entry and posts the corrected one in the SAME
transaction as the document update. An edited document with a stale ledger is the exact defect class
we spent today closing — the $20,800 of issued-but-unposted invoices, the 102 invoices with no spine
link, the 1,974 journal entries whose documents were deleted. Reuse the existing posters. Write NO
new GL math. The reversal is `reverseJournalEntryNoFlip` — the original is never flipped to
`voided`, because GL readers exclude `voided` at 13 sites.

**2 · THE SPINE LINK IS REWRITTEN WITH IT.**
The corrected entry writes its `accounting.transaction_source_links` row in the same transaction.
An edit that leaves the old link pointing at a reversed entry is a linkage defect.

**3 · FIELD-LEVEL AUDIT TRAIL — WHO, WHEN, OLD VALUE, NEW VALUE.**
QuickBooks' Audit History is the benchmark and the owner uses it. Every edit writes to
`audit.row_changes` (append-only, WORM). The document's screen shows its own edit history: field,
from, to, who, when. An edit nobody can see afterwards is worse than no edit.

**4 · CLOSED PERIOD — REFUSED.**
An edit whose entry date falls in a closed period is refused. `accounting.raise_if_txn_in_closed_period`
already exists; call it. This is QuickBooks' closing-date lock. Reopening a period reverses its
closing entry — CC-1 built that in #24229. Per §D-E7 a reopen takes a second person; an ordinary
correction in an open period does not.

**5 · A VOIDED DOCUMENT IS NOT EDITABLE.**
QuickBooks: "You can't undo a voided transaction." Same here. Void is terminal; the replacement is a
new document, and #24241 already links predecessor → successor.

**6 · APPLIED PAYMENTS MUST NOT BREAK SILENTLY.**
If an invoice carries $3,750 of applied payments and someone edits the total to $3,000, the
application is over-applied. **Refuse, and name the payment** — "payment PMT-xxxx for $3,750 is
applied to this invoice; unapply it before reducing the total below that amount." QuickBooks warns;
we refuse, because a silently over-applied invoice misstates A/R.

**7 · A FACTORED INVOICE'S AMOUNT IS NOT EDITABLE WHILE THE PURCHASE IS OPEN. ← THE ONE QUICKBOOKS
DOES NOT HAVE, AND THE DANGEROUS ONE.**
QuickBooks has no factoring, so there is no precedent to copy and this is ours to get right.
A factored invoice is **collateral**. Faro advanced cash against that exact amount, and `2150
Factoring Advance` ties to the Net Amount of open factored invoices — CC-2's #24199 guard asserts
it. Editing the amount silently would break that tie and misstate what we owe Faro.

- **Amount, and anything feeding the amount: REFUSED while the Faro purchase is open.** The message
  names the purchase and the Faro invoice number, and points at the credit memo.
- **The correction path is the reason-coded credit memo** ruled in ROUND 335 — it reduces open Net
  properly, keeps 2150 aligned, and keeps the A/R subledger and the ledger moving together.
- **Non-amount fields stay editable** — PO reference, bill-to address, terms, memo, dates that do
  not change the posting period.
- Once the purchase is closed and the invoice is no longer collateral, normal edit rules apply.

## "WHEN THERE IS A DISPUTE?" — THE OWNER'S QUESTION, ANSWERED
A dispute is a **record**, not a reason to leave the books wrong. `accounting.invoice_disputes` is
canonical and already exists (confirmed in CC-1's audit — and `DisputesHubPage` conflates two
different objects, which Cursor should fix while here).

The flow:
1. **Open a dispute** on the invoice with a reason. The invoice stays at full value and **open**,
   because we are actively pursuing it. This is the named exception to ROUND 335's write-down
   default — and now it is a row with an owner and a date, not a verbal state.
2. **It resolves one of three ways:** the customer pays (dispute closed, nothing posts) · we accept
   we overbilled (**edit the invoice** if unfactored, or a 4910–4980 reason-coded credit memo if
   factored) · the customer will not pay (6920 Bad Debt Expense credit memo).
3. **A dispute cannot sit open forever silently.** Age it on the A/R screen like any other
   receivable and surface it in the aging. An invoice open past terms with no dispute row and no
   collection activity is the thing the owner needs to see, not a quiet balance.

**Overbilled and unfactored → edit the invoice.** That is exactly what the owner asked for and it is
the cleanest answer: the document becomes correct, the ledger follows it in the same transaction,
and the audit trail shows what changed.

## PERMISSIONS — OWNER + ADMIN ONLY
Enforced in **both** places, never only the UI: the route checks the role, and the database enforces
it. A hidden button is not a permission. Accountant can post and reconcile but not edit a posted
document — that stays Owner/Admin, per the owner's words. Every edit is attributed to a real
`identity.users` row; no system actor may edit a document a person created.

## WHO BUILDS WHAT
- **CC-1** — rules 1, 2, 4, 5, 6: the edit→re-post transaction, the spine rewrite, closed-period
  refusal, voided-is-terminal, applied-payment refusal. One guard:
  `verify-document-edit-reposts-and-links`, wired into the gate, asserting that no edit path updates
  an amount on `accounting.{invoices,bills,expenses}` without calling the poster and the spine
  writer in the same transaction.
- **CC-2** — rule 7: the factored-invoice amount lock, and re-run the #24199 `2150 = open factored
  Net` guard against both an edit attempt and a credit memo on a fork, before/after pasted.
- **Cursor** — permissions enforced at the route and in the DB, the edit UI, the per-document edit
  history panel, the dispute flow on the invoice, and fixing `DisputesHubPage` conflating two
  objects. §9.0.17: the edit affordance appears on invoices, bills and expenses — that is ≥3 sites,
  so ONE guarded sweep and ONE generalized guard, never three PRs.

## THE LINE THAT DECIDES EVERY EDGE CASE
**The document and the ledger move together, in one transaction, or the edit is refused.** Nothing
in this ruling permits a document to change while its postings stay as they were.

§-1 at the moment of each claim · §0 DoD · ROUND 332.1 linkage declaration in every PR body.
