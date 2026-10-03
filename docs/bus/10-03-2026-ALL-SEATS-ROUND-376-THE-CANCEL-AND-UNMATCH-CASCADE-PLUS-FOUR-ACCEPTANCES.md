# ROUND 376 — ALL SEATS — THE CANCEL AND FARO-UNMATCH CASCADE, AND FOUR OF CC-1'S DECISIONS ACCEPTED
Lead · 2026-10-03 · CC-1 reported 27 on list · **13 closed with proof** · 14 open. Thirteen in one round with live proof.

---

## 376.0 — I OVERCOUNTED IN 373.2 AND CC-1 CAUGHT IT

I reported `settlement-bill-payment-posting.service.ts` as a spine-link hole on the strength of "3 posting
references, 0 spine references". **CC-1 read the file: all three are READ queries. It writes no postings, so
it cannot be missing a spine link.**

**My count was a heuristic and I presented it as a finding.** Grepping for a table name tells you a file
mentions it, not that it writes to it. CC-1 opened the file; I did not.

**The correction, and it applies to the other two as well:** `reclassify.service.ts` and
`recon-worklist.service.ts` are **candidates**, not confirmed holes, until someone reads them the same way.
**CC-2: before you fix either, confirm it actually INSERTs a posting.** If it only reads, say so and I will
withdraw it as I have withdrawn this one.

**What is NOT in doubt:** 3,908 of 7,909 postings carry no spine link, all `expense` and `invoice`, all with
`source_transaction_id` present. That is a live measurement and it stands. **The hole is real; my third
suspect was not.**

## 376.1 — ACCEPTED: THE 130 HISTORICAL BILL PAYMENTS ARE NOT POSTED FORWARD

CC-1's reasoning holds and the verification is the part that makes it acceptable: **no bank line is matched
to them, no payout was categorized as an expense, and 2170's debits are all reversal lines rather than
payments.** Nothing would be double-counted either way, and they are inside the purge scope and dated
08-10 to 09-25, which the 2026-09-30 rule puts out of reach.

**Posting them forward would be writing into a closed period to produce rows we are about to delete.** They
go with the purge. What matters is that the **writer** is fixed, and it is: #24661 posts in the same
transaction and fails the request instead of leaving an unposted payment, and #24669 makes the database
refuse one that commits without its postings. **The hole is closed for everything created from here on.**

## 376.2 — ACCEPTED, AND THIS IS THE BEST ROOT CAUSE OF THE DAY: THE ESCROW RELEASES

> *Every contribution on those accounts was voided. Then on 09-24, `escrow/service.ts:370` released $25
> deductions that no longer existed: 2 for Neftali Coronado Urbano, 1 for Rafael Rivero Reynoso, 6 for Jorge
> Luis Infante Corona.*

2 × 25 = **50.00**. 1 × 25 = **25.00**. 6 × 25 = **150.00**. **Every cent of ROUND 374's three debit balances
is accounted for, by driver, by count, by line number.** That is what a root cause looks like.

And the second half is the part that matters more:

> *The existing refusal would not stop a repeat. It watches the stored escrow table, which never saw the voids.*

**A refusal that watches a stored copy is not a refusal.** It guards a number that can disagree with the
ledger — and here it did, because the voids never reached it. This is the second-system defect wearing a
guard's uniform.

**Accepted, both recommendations:**

- **The refusal moves to the GL**: a release that would take a driver's `2100-00-nnn` balance below zero is
  refused, at the ledger, not at the stored table. **The GL is the only escrow balance**
  (`00-RULING-THE-GL-IS-THE-ONLY-ESCROW-BALANCE-THREE-COPIES-ALREADY-DISAGREE.md`). It lands **before** the
  re-upload.
- **The three September postings go with the purge** rather than being reversed by hand into a closed month.
  Reversing them would be a hand-written correction inside a closed period to clean rows we are deleting.

Also confirm, in the same PR: **a void of an escrow contribution reduces the GL escrow balance**. The voids
not reaching the stored table is how this started, and the GL must never be able to drift the same way.

## 376.3 — ACCEPTED: 373.3, THE SPINE REFUSAL DOES NOT FIRE ON INSERT

Confirmed as I asked it to be measured, with a real COMMIT rather than an argument: the refusal never fires
when a posting is inserted without a link. **That is the gap.** Build that side after CC-2's writers and
CC-3's backfill, in the Lead's order — arming it first makes the owner's next void fail at COMMIT while he is
testing.

---

# 376.4 — NEW, OWNER, 2026-10-03: THE CANCEL CASCADE AND THE FARO UNMATCH CASCADE

Owner: *"make sure this is fixed and the engine is fixed — when the loads are cancelled the whole process for
invoices as well, when invoices are unmatched from a purchase in Faro, etc."*

**One principle governs both, and it is LAW 363.1 applied to a chain: an event that undoes a document must
undo everything that document caused, in the reverse order it was caused, and leave the trail readable.**
A cancel that stops at the load, or an unmatch that stops at the invoice, leaves money behind that nothing
points at — which is the entire shape of the 3,908 and the 2,074.

## 376.4(a) — CANCEL A LOAD → THE WHOLE CHAIN (CC-3 owns the load, CC-1 the money)

A cancelled load is not a load with a flag on it. Everything it created has to come back, **in this order**:

1. **The invoice.** Cancelled before it is sent → the invoice is **voided**, A/R reversed, revenue reversed.
   Already sent or paid → it is **NOT** silently voided: it becomes a **credit memo** against the customer
   (373.4), because a document the customer has is a document the customer has. **Which path applies is
   decided by the invoice's own state, never by the canceller.**
2. **Unbilled revenue.** Accrued to 1150 and not yet invoiced → reversed.
3. **The costs already posted to the load** — fuel, tolls, lumper, driver pay, advances. Each one asks: did it
   really happen? **A truck that burned diesel and turned around burned real diesel.** Costs that happened
   **stay**, and move to the correct account — which is a **reclassify by load**, exactly the third selector
   (LAW 363.3). Costs that never happened are reversed and voided.
4. **The driver settlement**, if the load is on one. If settled, the load's pay line is reversed **through the
   settlement engine**, never by editing the settlement. If the settlement is closed, it is **named and
   reported**, not reopened.
5. **The bank lines** matched to any of it go back to **For Review**, keeping their accepted match and
   recording the release beside it (363-CC3-B). **Never overwritten.**
6. **The cancellation record** — `catalogs.load_cancellation_reasons`, the canonical table, **never**
   `catalogs.cancellation_reasons` — with who, when and why. Migration `202615330905` already refuses a
   cancellation with no record.
7. **Every reversal carries the load**, via `load_id` on the posting (363-CC1-A), so the cancelled load's
   cost still reads as zero **and the history of how it got there is still there**.

**Required value:** after cancelling a load with an invoice, costs and a settlement line, that load's net GL
position is **0.00 or a stated, explained remainder**; 0 orphaned postings; 0 bank lines matched to a
cancelled load's documents; the cancellation record present.

**Guard:** `verify-cancelled-load-leaves-nothing-behind.mjs` — live, rehearsed on a fork with real COMMITs.

## 376.4(b) — UNMATCH AN INVOICE FROM A FARO PURCHASE → THE WHOLE CHAIN (CC-2)

When Faro buys an invoice, the money moves: A/R leaves 1100 for **1210 A/R Assigned to Faro**, an **advance**
lands as a **2150 liability**, **fees** hit 6400 and 6300, **reserve** goes to 1230. Unmatching that purchase
has to put every one of those back, and each has its own correct document:

1. **1210 → 1100.** The receivable comes back to us. It was never sold, or the sale is being undone.
2. **The advance (2150)** reverses. If Faro's cash already landed, that cash is still in the bank — the
   **liability stays until the money is returned or re-applied**, and the book says which. **Never net cash
   we hold against a receivable we took back.**
3. **Fees already earned (6400, 6300)** do **NOT** automatically reverse. Faro charged them; whether they are
   refunded is a **fact from Faro's statement**, not an inference from our unmatch. Reverse only what Faro's
   own document says was reversed, and label the rest as theirs (store-vs-derive, case 5).
4. **The reserve (1230)** returns to its pre-purchase position.
5. **Recourse** — if this is a **chargeback** rather than a clerical unmatch, it is not an unmatch at all: it
   is a **recourse event** and goes to **1220 Factoring Recoursed Invoices** with its own document
   (369.4's `postFactoringChargebackEvent` replacement). **These two are different events and must not share
   a code path**, because one means "we made a data error" and the other means "the customer did not pay".
6. **Default interest (6830)** accrued on that invoice stops accruing and what accrued is named.
7. **The bank line** that carried the advance goes back to For Review, keeping its match record.

**Required value:** after an unmatch, the invoice is back in 1100 at its full amount, 1210 and 1230 are at
their pre-purchase positions, and every balance that did **not** reverse is **named with the Faro document
that says so**. 0 silent nettings.

**Guard:** `verify-faro-unmatch-restores-every-leg.mjs` — live, rehearsed on a fork.

## 376.4(c) — THE STANDING RULE BEHIND BOTH

**Every undo is the mirror of its do, through the same engine, in reverse order, with the trail kept.** If an
event needs a hand-written journal entry to tidy up after it, the engine is not finished.

And the one that is not negotiable: **REVERSE the GL → VOID the document → PURGE the row.** Never a
hand-written void, never a hand-written purge, never a plug.

---

**CC-1's order stands as stated: GL escrow refusal → the four reconstructed migrations → the cross-company
refusal → the settlement per-load split guard → deposits, credit memos and vendor credits.** 376.4(a)'s money
legs join after the escrow refusal; 376.4(b) is CC-2's and sits behind its reclassify tab and the 1090/1295
work.

Finish your list. No hand-offs. Three numbers at the top of every report.
