# UNIFIED DISPUTE WINDOW — SPECIFICATION

**Author:** Claude Lead · **Date:** 2026-09-13 · **Status:** SPEC. Coders build from this.

One dispute mechanism for every disputable thing in the system: driver settlements, settlement lines, customer invoices, vendor bills, expenses, fuel receipts, deductions, reimbursements, factoring advances, bank matches. Not one per module.

**Measured starting point (live, USMCA, 2026-09-13):** `driver_finance.driver_settlement_disputes` = 0 rows. `driver_finance.settlement_disputes` = 0 rows. `settlements.settlement_disputes` = 0 rows. `driver_finance.settlement_lines` with `disputed = true` = 0. `accounting.invoices` has no dispute column at all. Three empty tables competing for the same job and nothing disputable on the customer side. Clean slate — no data migration, only a writer repoint.

---

## 1. CANONICAL TABLES

**WRITE — new schema `disputes`:**

| Table | Purpose |
|---|---|
| `disputes.disputes` | the dispute itself, one row per raised dispute |
| `disputes.dispute_events` | append-only WORM timeline; every state change, comment, assignment |
| `disputes.dispute_evidence` | attachments, joins to `docs.files` |
| `disputes.dispute_window_policies` | per entity + subject type: window length, what it starts from, payment behaviour |
| `catalogs.dispute_reasons` | one reason catalog with `applies_to[]`, same pattern as the cancellation-reason ruling |

**NEVER WRITE — retire:** `driver_finance.driver_settlement_disputes`, `driver_finance.settlement_disputes`, `settlements.settlement_disputes`, and the six `disputed*` / `dispute_*` columns on `driver_finance.settlement_lines`. All empty. Repoint the writer; do not drag the FK. Columns are dropped by a later migration once nothing reads them.

### 1.1 `disputes.disputes` — required columns

```
id                        uuidv7 PK
operating_company_id      uuid, FORCED RLS
display_id                text, D-YYYY-NNNN, human-visible
subject_type              text, enum below
subject_id                uuid
subject_number            text   -- the human number: settlement 5790, invoice INV-2026-0031
subject_amount_cents      bigint -- the full amount of the thing being disputed
disputed_amount_cents     bigint -- what is contested, <= subject_amount_cents
load_id                   uuid null
settlement_id             uuid null
driver_id                 uuid null
customer_id               uuid null
vendor_id                 uuid null
reason_code               text -> catalogs.dispute_reasons
narrative                 text, min 20 chars
state                     text: open | under_review | resolved | withdrawn | expired
outcome                   text null, set only when state = resolved: upheld | partially_upheld | rejected
raised_by_user_id         uuid
raised_at                 timestamptz
window_opens_at           timestamptz
window_closes_at          timestamptz
assigned_to_user_id       uuid null
assigned_at               timestamptz null
resolved_by_user_id       uuid null
resolved_at               timestamptz null
resolution_note           text null, required when state = resolved
adjustment_amount_cents   bigint null
adjustment_document_type  text null
adjustment_document_id    uuid null
withheld_amount_cents     bigint default 0
voided_at, void_reason, voided_by_user_id
trace_no, trace_key
```

### 1.2 `subject_type` enum

`driver_settlement`, `settlement_line`, `invoice`, `bill`, `expense`, `fuel_transaction`, `deduction`, `reimbursement`, `factoring_advance`, `bank_transaction_match`, `accessorial_charge`, `work_order`.

The list is closed. Adding a type is a migration plus a window policy row plus a resolution path — never an ad-hoc string.

---

## 2. THE WINDOW

The window is the period during which a subject **may be disputed**. It is a right, with a clock, and it is visible to the person who holds it.

`disputes.dispute_window_policies`: `operating_company_id`, `subject_type`, `window_days`, `starts_from`, `blocks_payment`, `auto_expire`, `updated_by_user_id`, `updated_at`. Owner-editable in Settings; every change writes an audit row.

`starts_from` enum: `visible_to_counterparty_at` · `sent_at` · `posted_at` · `created_at`.

### 2.1 Proposed defaults — change any line and I will encode it

| Subject | Window | Starts from | Payment behaviour |
|---|---|---|---|
| driver_settlement | 7 days | visible to driver | partial_release |
| settlement_line | 7 days | inherits parent settlement | partial_release |
| deduction | 7 days | visible to driver | partial_release |
| reimbursement | 7 days | visible to driver | partial_release |
| invoice | 30 days | sent to customer | n/a (A/R) |
| accessorial_charge | 30 days | sent | n/a |
| bill | 30 days | posted | full_hold |
| expense | 30 days | posted | full_hold |
| fuel_transaction | 30 days | posted | full_hold |
| factoring_advance | 15 days | posted | full_hold |
| bank_transaction_match | no window | — | n/a |

**7 days for the driver side** because AlwaysTrack settles weekly and a driver must be able to contest the settlement he is looking at before the next one closes. **30 days on the customer side** matches standard invoice terms. **No window on bank matches** because matching is suggest-only forever and a suggestion is contestable until it is accepted.

### 2.2 Window rules

- **R1.** The window opens automatically when the subject becomes visible to the counterparty. It is never opened by hand.
- **R2.** `window_closes_at` is stamped at open and is immutable. Extending a window creates a new, explicitly logged extension event with a reason and an approver — it never silently moves the date.
- **R3.** When the window closes with no dispute raised, the subject is marked `dispute_window_closed`. Nothing else changes.
- **R4.** A dispute raised inside the window survives the window. The clock governs raising, not resolving. A dispute opened on day 7 is still live on day 40.
- **R5.** `auto_expire` transitions an **unresolved and unassigned** dispute to `expired` after the policy's grace period. An assigned dispute never auto-expires — it stays open until a human resolves it. Nothing quietly disappears.
- **R6.** A closed window locks the right to dispute. It does not lock correctness. A genuine error found afterwards is corrected by the normal void-and-adjust path with owner-level approval and a recorded reason. The window governs the counterparty's right to raise, never the company's duty to be right.

---

## 3. STATE MACHINE

```
                 ┌──────────► withdrawn      (raiser only, while open or under_review)
open ──assign──► under_review ──resolve──► resolved (outcome: upheld | partially_upheld | rejected)
  └──auto_expire──► expired                  (only while unassigned)
```

- `open` — raised, unassigned.
- `under_review` — a reviewer owns it.
- `resolved` — outcome set, resolution note written, adjustment issued if money moves.
- `withdrawn` — the raiser withdrew it. Money held is released.
- `expired` — the window's grace ran out with nobody assigned. The original stands.

Terminal states are terminal. Re-opening is a **new** dispute that references the old one by `supersedes_dispute_id`. A resolved dispute is never edited.

---

## 4. HARD RULES

**H1 — Maker ≠ checker.** The user who raised a dispute can never assign it to themselves, never resolve it, never set its outcome. Enforced in the service, not only the UI. This is the standing in-app maker/checker law.

**H2 — Append-only.** A dispute row is never deleted. Every state change, assignment, comment and evidence attachment writes a `disputes.dispute_events` row. That table is WORM — insert only, no update, no delete.

**H3 — Resolution never mutates the disputed document.** A locked settlement, a sent invoice and a posted bill are historical records. Resolution issues an **adjustment**:

| Subject | Adjustment when money moves |
|---|---|
| driver_settlement, settlement_line, deduction, reimbursement | a new settlement line, type `dispute_adjustment`, on the **next open settlement** for that driver, referencing the dispute and the original line |
| invoice, accessorial_charge | a credit memo against the invoice (debit memo if the adjustment is upward). The sent invoice is never edited |
| bill | a vendor credit |
| expense, fuel_transaction | the original is voided with a reason naming the dispute, and a correcting row is written |
| factoring_advance | a factoring adjustment entry through the existing gated poster |
| bank_transaction_match | the suggestion is rejected and re-suggested. Nothing posts |

**H4 — No new GL math.** Every adjustment posts through an existing posting function. If no function exists for a path, that path is not shipped until one does.

**H5 — Money never moves on an unresolved dispute.** `partial_release` withholds the disputed amount to `2170 Driver Net-Pay Clearing` and releases the remainder. `full_hold` releases nothing. Withheld money is relieved only by resolution or withdrawal, and the relief is idempotent on dispute id + bank transaction id.

**H6 — Entity-scoped.** `operating_company_id` on every row, FORCED RLS, and the subject must belong to the same entity. A dispute never spans entities.

**H7 — Every dispute is reachable from its load.** Where the subject has a load, `load_id` is set and the dispute appears on that load's detail screen like any other linked record. A dispute with no linkage declaration is not done.

**H8 — The settlement / tour number sits beside every subject number**, in the queue, in the detail, in the driver app, in every export. Standing law, no exceptions. Use `apps/frontend/src/lib/settlementNumber.ts`. The visible number is `source_document_ref`; `display_id` is internal and never rendered; an open tour reads "Open", never a bare dash.

---

## 5. WHAT THE DISPUTE WINDOW LOOKS LIKE

One component set, used everywhere. Not a per-module build. No restyling of surrounding screens — this is new surface, dropped into existing layouts, following the app's existing table and drawer patterns. No charts on any of it.

### 5.1 The window banner — on every disputable subject

Sits at the top of settlement detail, invoice detail, bill detail, expense detail, fuel receipt detail. Three states, one line each:

- **Open** — `Dispute window open · closes Fri 2026-09-20 11:59 PM CT · 5 days 4 hours left`
- **Closed, clean** — `Dispute window closed 2026-09-14 · no disputes raised`
- **Active dispute** — `1 dispute open · D-2026-0014 · $751.05 withheld · assigned to Ana` and the amount is shown withheld on the money panel, not subtracted silently

### 5.2 The Dispute button

On the subject header **and** on every disputable row inside it — each settlement line, each fuel receipt, each expense line, each invoice line. Disabled with a reason tooltip when the window is closed (`Window closed 2026-09-14`) or when the user already has an open dispute on that exact subject.

### 5.3 The raise modal

- **Subject**, read-only, with its number, its settlement/tour number beside it, and its amount — e.g. `Settlement 5790 · line: Loaded Miles 1,502.1 @ $0.50 · $751.05`
- **Reason** — required, from `catalogs.dispute_reasons`, filtered by `applies_to` for this subject type. Seed set:
  - driver side: wrong loaded miles · wrong empty miles · wrong rate per mile · missing pick/drop pay · missing detention · missing accessorial · load not mine · deduction not mine · deduction amount wrong · escrow amount wrong · advance already repaid · fuel receipt not mine · fuel amount wrong · expense not authorized · reimbursement not paid
  - customer side: rate does not match the rate confirmation · accessorial not authorized · detention not owed · duplicate invoice · already paid · wrong customer · wrong load
  - vendor side: duplicate bill · never received · price differs from quote · wrong quantity · warranty should apply
  - `other` — always present, always requires the narrative
- **Disputed amount** — required, defaults to the subject amount, cannot exceed it, cannot be zero or negative
- **Narrative** — required, minimum 20 characters. A dispute with no explanation is not a dispute
- **Evidence** — file attach to `docs.files`, multiple, prompted but not mandatory. Photo, BOL, rate confirmation, receipt, scale ticket
- **Window remaining**, live, at the bottom of the modal

On submit: create the dispute, write the `raised` event, apply the withholding per policy, notify ops. One transaction.

### 5.4 The dispute queue — `/disputes`

Every subject type in one list. This is the screen the office lives on.

**Columns:** dispute # · raised · age · window remaining · subject type · subject number · **settlement / tour number** · driver or customer · reason · disputed amount · withheld · state · outcome · assignee.

**Filters, multi-select where it makes sense:** state · outcome · subject type · reason · driver · customer · vendor · entity · assignee · date raised range · disputed amount range · window-closing-soon · unassigned only · mine only · has evidence.

**Saved views** with live counts: `Unassigned` · `Closing in 48h` · `Over 7 days old` · `Driver disputes` · `Customer disputes` · `Awaiting my review` · `Resolved this month`.

**Header metrics, numbers not charts:** open count · open disputed amount · withheld total · median days to resolve · % upheld · disputes per 100 settlements.

Every row opens the detail in a drawer; the list keeps its place.

### 5.5 The dispute detail

- The subject rendered inline, with the disputed line highlighted and the rest of the document visible around it, so the reviewer sees context without leaving.
- **Timeline** — every event from `disputes.dispute_events`, oldest first: raised (who, when, reason, amount), assigned, comments, evidence added, resolved. Nothing is editable.
- **Evidence gallery** — thumbnails, click to open.
- **Comment box** — internal comments and counterparty-visible comments are separate and labelled. A driver never sees an internal note.
- **Resolution panel** — visible only to a user who is not the raiser:
  - outcome: upheld · partially upheld · rejected
  - adjustment amount (defaults to the disputed amount on `upheld`, editable on `partially_upheld`, forced to 0 on `rejected`)
  - **a preview of exactly what will be created, before commit** — e.g. `This will add a +$120.00 dispute_adjustment line to settlement 5811, the next open settlement for Leonel Antonio Morales, and release $631.05 of the $751.05 withheld.`
  - resolution note, required
  - one Resolve button, idempotent

### 5.6 The driver app

The driver sees his own disputes only. He can raise one from his settlement or from any line on it, attach a photo, withdraw his own, and see the countdown and the outcome with the reviewer's note. He can never assign, resolve, or see another driver's dispute, and he never sees an internal comment. Spanish and English — the roster is bilingual.

### 5.7 Notifications

raised → ops queue · assigned → the assignee · comment visible to counterparty → the counterparty · resolved → the raiser, with the outcome and the note · window closing in 48h with a dispute still open → assignee and ops · unassigned for 24h → ops.

---

## 6. WHAT MUST NOT BE BUILT

- No auto-resolution. No rule that closes a dispute because a number now matches. A human resolves every dispute.
- No silent adjustment. Nothing moves money without a resolution row naming who decided and why.
- No editing a locked settlement, a sent invoice or a posted bill. Ever. Adjustments only.
- No dispute that deletes anything.
- No second dispute table. If a module needs a dispute, it uses `disputes.disputes` with a new `subject_type`.
- No free-text-only reasons. The catalog is how this becomes reportable.
- No charts on these screens.

---

## 7. ACCEPTANCE

`scripts/verify-dispute-window.mjs` asserts, against prod:

1. A dispute can be raised on every one of the 12 `subject_type` values, and each lands in `disputes.disputes` with the correct `operating_company_id` and a `raised` event.
2. `window_closes_at` matches the policy for that subject type, computed from the correct `starts_from` timestamp.
3. The raiser cannot assign to self and cannot resolve — the service rejects it, not just the UI.
4. Resolution with `upheld` creates the adjustment document named in H3 and creates **no** edit to the disputed row.
5. `partial_release` withholds exactly the disputed amount and releases the remainder; resolution relieves it exactly once, re-running the relief changes nothing.
6. `dispute_events` has no UPDATE and no DELETE grant for the runtime role.
7. Every dispute with a load subject is reachable from that load's detail, both ways.
8. The settlement / tour number renders beside the subject number on the queue, the detail, the driver app and every export.
9. An expired window blocks a new dispute and returns the closing date in the error.
10. RLS: a user in one entity cannot read or raise a dispute in another.

**Done means the guard passes against prod and the owner can raise, review and resolve a dispute in Chrome end to end.** Merged is not done.

---

## 8. OPEN FOR THE OWNER — ONE LINE EACH

1. **Window lengths** — 7 days driver side, 30 days customer/vendor side, 15 days factoring. Change any number and it is encoded.
2. **Payment behaviour** — default `partial_release`: the undisputed remainder pays, the disputed amount is withheld. The alternative is `full_hold`: nothing pays until resolved.
3. **Who may resolve** — proposed: Admin, Owner, Accountant for money outcomes; Dispatch may assign, comment and resolve `rejected` on operational reasons only. Maker ≠ checker applies to all of them.
