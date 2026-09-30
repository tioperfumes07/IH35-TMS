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
| **Disputes** | CROSS-LINK from the payee view. NOT a tab that owns accounting data. A dispute posts nothing — zero references in `posting-engine.service.ts` — it is a workflow record about a disagreement. It may LEAD to a deduction or reimbursement correction; that correction is the accounting event, not the dispute. |

**THE ADDITION, and it is a real defect, registered not fixed:** `DisputesHubPage.tsx` unifies
`accounting.invoice_disputes` and the settlement disputes into one screen. Those are two different
objects — different counterparty, opposite direction of money, different remedy. A customer
disputing our invoice and a driver disputing his pay have nothing in common but the word. One screen
for both is how a user ends up reading one as the other. **Registered as C-25 (Cursor, UI split) and
A-25 (CC-1, confirm the two object sets never share a query).** Under the freeze: split the
presentation, touch no rows.

**Also registered, not in scope here:** `settlements.settlement_disputes` and
`settlement.settlement_deduction` are retired-duplicate schemas. `driver_finance.*` is canonical.
Retiring them is its own job with its own proof — not a side effect of a UI ruling.

## A-14 — The QBO report set for the Driver Profile. ACCEPTED.

Build it the way QuickBooks builds a Vendor: the driver is a payee, and the profile answers
what we owe him, what we paid him, and what he owes us back. CURSOR builds against CC-1's shapes.

## A-16 — "Has transactions". ACCEPTED, including the edge case.

ONE predicate per party, server-side, one function each side calls. Not two definitions, not a
client-side filter.

**The owner's own example — a customer with only a voided invoice — COUNTS AS HAVING TRANSACTIONS.**
CC-1's reasoning is right and I am adopting it verbatim: void-not-delete makes a voided invoice real
history, and a user asking "did we ever bill this customer" must get *yes*. Ten real USMCA customers
have exactly that shape. Hiding them would be the system quietly forgetting something that happened.

Live under the accepted predicates:

| | with transactions | total | without |
|---|---|---|---|
| Customers | 76 | 1,249 | 1,173 |
| Vendors | 34 | 623 | 589 |

**LANDMINE, registered as A-26 and NOT to be fixed inside the predicate work:**
`accounting.bills.vendor_uuid` is `text` while `mdata.vendors.id` is `uuid`. Every join between them
needs an explicit cast today. A type mismatch on a money join is a real defect and it gets its own
job, its own migration and its own proof — never a quiet cast buried in a new function.

---

**Why this ruling is short:** CC-1 did the work. Measured enums, pasted counts, read the column that
settled Permits instead of arguing about it, and flagged the two things it was NOT sure about rather
than deciding them quietly. That is the report shape I want from every seat.
