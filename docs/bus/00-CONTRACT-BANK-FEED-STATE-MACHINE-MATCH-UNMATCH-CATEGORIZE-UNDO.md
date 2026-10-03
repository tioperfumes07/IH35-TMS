# CONTRACT — THE BANK FEED STATE MACHINE. MATCH / UNMATCH / CATEGORIZE / UNDO. THIS IS THE SPEC.

Owner, 2026-10-03, verbatim: *"WHEN I MATCH A TRANSACTION IT RECORDS CORRECTLY. WHEN I UNMATCH A
TRANSACTION, THE TRANSACTION, OR CREATED EXPENSE OR CREATED BILL OR CREATED BILL PAYMENT OR RECEIVE PAYMENT
MUST GO BACK, AND APPEAR AVAILABLE TO MATCH AGAIN. IF I UNDO A TRANSACTION THAT WAS JUST CATEGORIZED, IT
SHOULD GO BACK FOR REVIEW, IT SHOULD NOT BE RECORDED IN THE ACCOUNT IT WAS CATEGORIZED IN BECAUSE WE JUST
UNCATEGORIZED. THE IMPACT SHOULD BE INSTANT, LIKE IN QUICKBOOKS. I WANT TO MAKE SURE YOU UNDERSTAND,
BECAUSE THESE ISSUES KEEP ARISING."*

They keep arising because this was never written down. It is written down now. **This file is the spec; a
PR that contradicts it is wrong even if it passes.**

## THE ONE DISTINCTION EVERYTHING DEPENDS ON
There are two ways a bank line leaves For Review, and they are **not** the same operation reversed:

- **CATEGORIZE** — the bank line **CREATES** a document (an expense, usually). The document did not exist
  before. The GL impact is **new**.
  → **UNDO must REMOVE what it created.** The account must no longer carry the amount.

- **MATCH** — the bank line is **LINKED** to a document that **already existed** and was **already
  posted**. Matching creates **no** GL impact; it only says "this bank line is that document."
  → **UNMATCH must only BREAK THE LINK.** The document is untouched and goes back to the available pool.
  **Deleting it would destroy a record the bank line never created.**

One button cannot do both jobs blindly. It must know which case it is in — which is why
`resolution_kind` exists alongside `review_bucket`.

## THE STATE TABLE — EVERY TRANSITION, EXHAUSTIVE

    ACTION              BUCKET BEFORE    BUCKET AFTER    THE DOCUMENT                      THE GL
    Categorize          for_review       categorized     CREATED (expense/deposit)         POSTED (new)
      kind: added
    UNDO (of a          categorized      for_review      DELETED, or reversed through      REMOVED — the account
      categorize)       kind: added                      the governed path if it can       no longer carries it
                                                         no longer be deleted
    Match               for_review       categorized     UNTOUCHED — pre-existing,         UNCHANGED — it was
      kind: matched                                      now linked                        posted when created
    UNMATCH             categorized      for_review      UNTOUCHED — link cleared,         UNCHANGED
                        kind: matched                    BACK IN THE MATCH POOL
    Exclude             for_review       excluded        none                              none
    UNDO (of exclude)   excluded         for_review      none                              none
    Transfer            for_review       categorized     the paired transfer entry         POSTED (new)
      kind: transfer
    UNDO (of transfer)  categorized      for_review      DELETED / reversed                REMOVED
                        kind: transfer

**Three buckets only — `for_review`, `categorized`, `excluded` — exactly QuickBooks' three tabs.**
`matched` and `transfer` are **kinds**, shown in the Action column, never buckets. A row must never land
anywhere a tab cannot show.

## THE FOUR HARD REQUIREMENTS
1. **INSTANT.** All of it in **one database transaction**, synchronously, inside the request. When the
   screen returns, the account balance is already correct. **No background job, no queue, no eventual
   consistency.** A number that is right "in a minute" is wrong.
2. **AVAILABLE TO MATCH AGAIN.** After UNMATCH the document must reappear in the match-candidate list
   immediately. **Specific failure to check:** if the document carries its own flag — `is_matched`,
   `matched_at`, `reconciled`, a status — unmatch must clear it too. A document released by the bank line
   but still flagged on its own row will never come back, and that is the most likely way this breaks.
3. **ALL FIVE DOCUMENT TYPES.** Expense, bill, bill payment, receive payment (customer payment), and
   transfer. The owner named them. Each one match/unmatch/categorize/undo, each one proven.
4. **NEVER A DOUBLE REVERSAL.** Before reversing, read whether the document is already reversed. 13515 was
   already reversed under AUTH-201 and reversing again would have re-recognised the money. Undo of an
   already-voided document is a **no-op on the GL** and clears the link only.

## WHAT IS BROKEN TODAY — MEASURED, NOT ASSUMED
- UNDO put **29 of 36** rows into `matched` with **both link columns NULL** — a bucket with no tab, a row
  claiming a document it does not have. Seven went to `for_review` correctly, so both paths exist and the
  wrong one is being taken.
- UNDO **never touched the ledger.** Posting count identical before and after. The documents those
  categorizations created are still live and still posting in the accounts he uncategorized. **That is
  exactly what the owner says must not happen.**

## THE GUARDS THAT MAKE IT UNABLE TO REGRESS — CEILING 0, BASELINES COMMITTED
    verify-bank-line-buckets-are-the-three-tabs    no row outside for_review/categorized/excluded
    verify-categorized-has-a-document              bucket categorized => a kind AND a live link
    verify-for-review-has-no-document              bucket for_review  => kind NULL AND both links NULL
    verify-undo-leaves-no-document-behind          no document whose only bank line was undone
    verify-unmatched-document-is-matchable-again   every unlinked document appears in the candidate query
    verify-undo-is-single-transaction              the whole transition commits or none of it does

## THE FINISH TEST — DEMONSTRATED ON A FORK, PASTED, OR IT IS NOT DONE
For **each** of the five document types, in order, with the account balance shown at every step:
    categorize -> account carries it -> UNDO -> bank line in For Review AND the account no longer carries it
    match      -> account unchanged  -> UNMATCH -> bank line in For Review AND the document is matchable again

**→ CC-2 owns this whole contract.** It is one engine, not six tickets. The owner is going to re-enter data
within hours and will use every one of these paths on the first day.

---

# VERIFIED AGAINST INTUIT'S OWN DOCUMENTATION — 2026-10-03

The owner asked for this contract to be verified, not assumed. From Intuit's *Match your bank and credit
card transactions* help article:

- **"Matching links your bank transactions to records you already created in QuickBooks, like invoices,
  receipts, and bills."** — match LINKS. It does not create.
- **"Match it: Choose this option if you already entered a record for the transaction in QuickBooks"** vs
  **"Categorize it: Choose this option if you don't have an existing record. This creates a brand-new
  record in QuickBooks."** — Intuit draws exactly the distinction this contract is built on.
- Transactions **"won't affect your books until you match or categorize them."**
- Undo a match → **"QuickBooks moves the transaction back to the Pending (or For review) tab"**, and the
  underlying record **remains intact.**

**The contract above is correct as written. Build to it.**

## THE OWNER'S WORKFLOW POINT — RIGHT, WITH ONE PRECISION THAT CHANGES THE BUILD
Owner: *"IN MATCH, A DOCUMENT ... IS MATCHED TO THE BANK TRANSACTION, IN ESSENCE IT IS HAVING THE
TRANSACTION READY, INSTEAD OF CATEGORIZING INSTANTLY IN THE BANK FEED WHEN IT APPEARS. IT IS MOSTLY FOR
TRANSACTIONS BEFORE THEY HIT OUR BANK, THEY APPEAR IN ACCRUAL REPORTS BUT NOT CASH BASIS UNTIL IT IS
MATCHED."*

**The workflow description is exactly right.** You enter the bill, the bill payment, the customer payment
when it happens, and when the bank line arrives days later you **match** instead of categorizing —
because categorizing would create a *second* record of money that is already on the books.

**The precision, and it decides what the engine must NOT do:** cash-basis recognition in QuickBooks is
driven by the **date of the payment document**, not by the bank match. A bill sits in accrual-only until a
**bill payment** exists; the bill payment is what brings it onto cash basis. **Matching the bank line
posts nothing** — it records that the item cleared the bank.

In day-to-day practice these land close together, which is why it feels like the match does it. But the
distinction is load-bearing for us:

**IF MATCH POSTED ANYTHING, WE WOULD DOUBLE-COUNT.** The document was already posted when it was created.
The entire reason MATCH exists is that the accounting has already happened. **Match writes no journal
entry. Unmatch reverses no journal entry.** Any PR that posts on match is wrong on its face.

## THE MATCHED VIEW — THE OWNER'S WORDING IS THE SPEC
Owner: *"MATCHED BUCKET SHOWS THE CATEGORIZED TRANSACTIONS THAT WERE MATCHED TO A CREATED DOCUMENT."*

That is exactly the model: **matched is a view inside Categorized**, not a fourth tab. The Categorized tab
lists every resolved line; each row's Action column says whether it was **Added** (categorize created it)
or **Matched** (linked to a document that already existed). A filter or a column on the Categorized tab
may show only the matched ones — that is a **filter over `resolution_kind`**, never a separate bucket a
row can get stranded in.

`review_bucket` = where it sits (3 values, 3 tabs). `resolution_kind` = how it got there (shown, filterable).
