# LEAD RULING — 2026-09-30 — Driver Profile tabs (A-13), the QBO report set (A-14), and "has transactions" (A-16)

Ruling on CC-1's accounting read, `docs/bus/2026-09-30-CC1-A13-A14-A16-DRIVER-PROFILE-AND-HAS-TRANSACTIONS-ANALYSIS.md`.
CC-1 measured before recommending — live status enums verified, live counts pasted, the `unit_id`
column on `safety.permits` actually read rather than assumed. That is why this ruling is short.

**BINDING ON: CURSOR (C-20, C-21, C-22), CC-1 (A-20, A-21).**

---

## A-13 — The Driver Profile tab set. ACCEPTED as CC-1 proposed, with one addition.

| Tab | Ruling |
|---|---|
| **Settlements** | ACCOUNTING. The driver-as-payee ledger. Top-level tab. |
| **Pre-settlements** | ACCOUNTING. Same object, different status — NOT a second table. Render as a status filter on Settlements, not as a parallel tab with its own query. `mdata.loads.presettlement_link_id` confirms it. |
| **Cash Advances** | ACCOUNTING. Top-level tab. Owner-locked as an ASSET (1245 Driver Cash Advances Receivable), recovered through settlement. It is a receivable, never an expense, and the tab must never present it as one. |
| **Deductions** | ACCOUNTING, but a SUB-LEDGER UNDER SETTLEMENTS — not a peer top-level tab. A deduction has no life of its own: it exists as a line on a settlement. Giving it a peer tab invites someone to create one without a settlement. |
| **Permits** | OPERATIONAL. Stays in Driver Hub / Safety. Decisive fact, and it is a fact not an opinion: `safety.permits` is keyed to `unit_id`, not `driver_id`. It is a truck's permit, not a driver's. |
| **Disputes** | CROSS-LINK from the payee view, showing **driver pay disputes only**. NOT a tab that owns accounting data. A dispute posts nothing — zero references in `posting-engine.service.ts` — it is a workflow record about a disagreement. It may LEAD to a deduction or reimbursement correction; that correction is the accounting event, not the dispute. |

**THE ADDITION — OWNER, 2026-09-30: "separate driver and customer and vendor disputes."**
THREE ways, not two. `DisputesHubPage.tsx` currently unifies `accounting.invoice_disputes` and the
settlement disputes on one screen; the owner's ruling adds the vendor side as its own object too.

  DRIVER    — a driver disputes his pay.            We owe him.      driver_finance.*
  CUSTOMER  — a customer disputes our invoice.      They owe us.     accounting.invoice_disputes
  VENDOR    — we dispute what a vendor billed us.   We owe them.     vendor/bill side

Three counterparties, three directions of money, three remedies. They have nothing in common but the
word "dispute", and one screen for all of them is how a user reads one as another. **C-25 (Cursor,
split the presentation three ways) and A-25 (CC-1, prove the three object sets never share a query,
and name the vendor-side table — if none exists, say so rather than inventing one).** Under the
freeze: split the presentation, touch no rows.

**Also registered, not in scope here:** `settlements.settlement_disputes` and
`settlement.settlement_deduction` are retired-duplicate schemas. `driver_finance.*` is canonical.
Retiring them is its own job with its own proof — not a side effect of a UI ruling.

## A-14 — The QBO report set for the Driver Profile. ACCEPTED.

Build it the way QuickBooks builds a Vendor: the driver is a payee, and the profile answers
what we owe him, what we paid him, and what he owes us back. CURSOR builds against CC-1's shapes.

## A-16 — "Has transactions". **CORRECTED BY THE OWNER. My first ruling was wrong.**

I accepted CC-1's position that a customer whose only document is a VOIDED invoice counts as having
transactions. The owner overruled it in one sentence and he is right:

> "by transactions i mean real money transactions. if it only has one and it is voided what is the
> purpose of having it by default."

None. A voided invoice is not a money transaction — it is the record of one that was cancelled. A
default list exists to show the parties you actually do business with, and a party whose entire
history is a cancellation is not one of them.

**THE RULE: "has transactions" means REAL MONEY MOVEMENT.**
  Customer — a NON-VOIDED invoice, or a payment received.
  Vendor   — a NON-VOIDED bill, or a non-voided expense.
Voided documents never qualify, on either side. Sample data never qualifies.

Those parties are NOT hidden from the system: they remain in the "all" view and in search. They just
do not fill the default list with names you have no live business with.

LIVE COUNTS UNDER THE CORRECTED PREDICATE, measured on br-fancy-credit-akjnd07a:

| | with real money | total | previous (void-inclusive) |
|---|---|---|---|
| Customers | **65** | 1,249 | 76 |
| Vendors | **34** | 623 | 34 |

Eleven customers were appearing only on the strength of a cancelled document. No vendor was — the
vendor number is unchanged, which is itself a useful check that the correction did what it says.

ONE predicate per party, server-side, one function each side calls. Not two definitions, not a
client-side filter.

**LANDMINE, registered as A-26 and NOT to be fixed inside the predicate work:**
`accounting.bills.vendor_uuid` is `text` while `mdata.vendors.id` is `uuid`, and
`accounting.expenses.vendor_uuid` is uuid — so the two AP joins are not even the same shape as each
other. Every bill join needs an explicit cast today. A type mismatch on a money join is a real defect
and it gets its own job, its own migration and its own proof — never a quiet cast buried in a new
function.

---

**Why this ruling is short:** CC-1 did the work. Measured enums, pasted counts, read the column that
settled Permits instead of arguing about it, and flagged the two things it was NOT sure about rather
than deciding them quietly. That is the report shape I want from every seat.

**And why part of it is now struck through:** I accepted the voided-invoice edge case and the owner
overruled it the moment he read it. Recorded here rather than quietly re-written, because the next
person reading this file should be able to see that the first answer was wrong and why — that is
worth more than a clean-looking document.
