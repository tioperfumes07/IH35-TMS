# ROUND 373 — ALL SEATS — THE SPINE HOLE IS MEASURED, THE THREE WRITERS ARE NAMED, AND THE BACKFILL NEEDS NO GUESSING
Lead · 2026-10-03 · measured by the Lead on the DIRECT endpoint as `ih35_ci_readonly`, USMCA only, BEGIN READ ONLY

The owner: *"yes we need to fix that linkage hole. Let's get all this fixed permanently now."* Here it is,
measured rather than described, with the writers named and the backfill proven to need no guesswork.

New scripts, both read-only, both committed: `scripts/verify-every-posting-has-its-spine-link.mjs` and
`scripts/verify-documents-survived-the-undo.mjs`. Both refuse to print a number if they find themselves
connected as `ih35_app`, because that is the pooler and every count would be masked.

---

## 373.1 — THE HOLE: 3,908 OF 7,909 POSTINGS HAVE NO SPINE LINK, AND EVERY ONE OF THEM IS REPAIRABLE

```
postings in scope .................. 7,909
postings with NO spine link ........ 3,908      (journal_entries.source = 'auto', 2026-09-24 → 2026-09-30)
```

Broken down by what the posting itself says it came from:

| source_transaction_type | unlinked | carries `source_transaction_id` | carries `load_id` |
|---|---|---|---|
| `expense` | **3,860** | **3,860 — all of them** | 0 |
| `invoice` | **48** | **48 — all of them** | 0 |

**Every single unlinked posting already names its own source document on the posting row.** The spine row is
missing; the information is not. **The backfill is mechanical and provable, with nothing inferred** — which
is the opposite of the 114 reversal lines we could not prove and correctly left NULL.

And it corroborates CC-3's ROUND 361 measurement exactly, from the other side: CC-3 found **1,930 expense
reversal lines** and **48 invoice reversal lines** with no spine link. A reversal line posts **two** legs, a
debit and a credit. 1,930 × 2 = **3,860**. The invoice number matches to the row. **Two independent
measurements, taken days apart by different seats, agree to the unit.**

What a healthy writer looks like, for contrast — the 4,001 postings that ARE linked:

```
expense 1,556 · journal_entry 775 · fuel_event 510 · driver_settlement 420 · load 387 · invoice 135
bill 96 · manual_je 46 · escrow_account 32 · driver_cash_advance 24 · customer_payment 14 · bank_reconciliation 6
```

Read that against the table above. **`expense` and `invoice` appear on BOTH lists.** Same document type,
some postings linked and some not. So this was never "expenses don't link" — **one writer links and another
does not**, and the unlinked ones are the reversal path.

## 373.2 — THREE WRITERS TOUCH POSTINGS AND NEVER WRITE A SPINE LINK. ONE OF THEM IS THE ENGINE THE OWNER IS WAITING ON.

Static sweep of every service that writes `accounting.journal_entry_postings`, counting spine calls:

| Service | posting refs | spine refs | Verdict |
|---|---|---|---|
| `accounting/posting-engine.service.ts` | 15 | 6 | links |
| `accounting/journal-entries.service.ts` | 16 | 7 | links |
| `accounting/void.service.ts` | 11 | 3 | links |
| `accounting/amortization-posting/amortization-posting.service.ts` | 4 | 2 | links |
| **`accounting/reclassify/reclassify.service.ts`** | **3** | **0** | **WRITES POSTINGS, NEVER LINKS** |
| **`accounting/settlement-posting/settlement-bill-payment-posting.service.ts`** | **3** | **0** | **WRITES POSTINGS, NEVER LINKS** |
| **`accounting/bank-recon/recon-worklist.service.ts`** | **1** | **0** | **TOUCHES POSTINGS, NEVER LINKS** |

**`reclassify.service.ts` already exists and writes postings with no spine link.** The owner has made the
reclassify tab the top of CC-2's list and it blocks the purge (368.1, 370). **If it ships as it stands, every
reclassify he performs digs this hole deeper** — and he is about to reclassify a few and void a few on live
rows specifically to test that the engines work.

**This is fixed BEFORE the reclassify tab ships. Not after. Not in a follow-up.**

`settlement-bill-payment-posting.service.ts` is the second one, and it sits next to CC-1's 363-CC1-B work on
the 130 bill payments that never posted. **CC-1: do not post the 130 forward through a writer that does not
write the spine.** You would turn 130 unposted documents into 260 unlinked postings.

**Assignments, no hand-offs, each seat builds both halves:**
- **CC-2** — `reclassify.service.ts` and `recon-worklist.service.ts`
- **CC-1** — `settlement-bill-payment-posting.service.ts`, as part of 363-CC1-B
- **CC-3** — the backfill of the 3,908 and the finish test, per 363-CC3-A

## 373.3 — THE PERMANENT FIX: A POSTING CANNOT COMMIT WITHOUT ITS SPINE LINK

Fixing three writers fixes three writers. **The fourth writer, written next month by someone who never read
this, is what the refusal is for.**

`trg_live_posting_keeps_spine_link` (migration `202615330906`) is a CONSTRAINT TRIGGER, **DEFERRABLE INITIALLY
DEFERRED**, so it fires at COMMIT. The 3,908 predate it — they were written 09-24 to 09-30.

**Required, CC-1, and it is a measurement not an assumption:** prove the trigger fires on an **INSERT of a
posting with no link**, not only on the deletion of a link. Rehearse on a fork with a real COMMIT, because a
deferred constraint proves nothing until something commits. If it only guards deletions, that is the gap and
it is closed in the same PR.

- **Required value:** attempt to commit a posting with no spine link → **refused**. 0 postings created after
  the refusal lands without a link.
- **Guard:** `verify-every-posting-has-its-spine-link.mjs` — already written and committed; wire it live and
  pin the unlinked count so it can only shrink.

**Sequencing, so nothing breaks under the owner's hands:** the three writers are fixed **first**, then the
3,908 are backfilled, then the refusal is armed. Arming it first would make his next void fail at COMMIT
while he is testing.

## 373.4 — CREDIT MEMOS, VENDOR CREDITS AND DEPOSITS ARE NOT BUILT. THE OWNER CONFIRMED IT. BUILD THEM. (CC-1)

The Lead's census found `accounting.credit_memos` **0** and `accounting.vendor_credits` **0** on USMCA. Owner,
2026-10-03: *"yes the credit memos, vendor credits, deposit engines are not fully built."* So the zero is
honest — the tables exist and nothing has ever been written to them.

All three are standard QBO documents and all three are missing from a book we are about to rebuild:

- **Credit memo** — reduces what a customer owes. Debit income or a contra-income account, credit A/R.
  Applies against one or more open invoices, or sits as an available credit. **A short-pay we cannot explain
  is a credit memo we did not write.**
- **Vendor credit** — reduces what we owe a vendor. Debit A/P, credit the original expense account. Applies
  against open bills. This is how a fuel-card rebate, a returned part or a billing correction is recorded
  instead of quietly netting it against the next bill.
- **Deposit** — takes one or more payments out of Undeposited Funds (1090) and puts them in the bank account
  as a single bank line, which is **exactly what the bank statement shows**. This is also the replacement
  document for `sweepMatchedReceiptToBank` under 369.4: **the deposit exists before the bank line is matched
  to it. The match never invents it.**

Each one: the document, the poster through the one writer, the spine link, the full linkage declaration, the
reverse and void paths, its own list surface with QBO filters, and the ability to be matched in the bank feed.

**Deposits go before the purge** — the sweep poster cannot be removed under 369.4 until the deposit document
exists to replace it. Credit memos and vendor credits ship immediately after, before the re-upload, because
the owner will need both the first time a customer short-pays or a vendor credits a fuel bill.

## 373.5 — OWNER RULING: NO USMCA RECORD REFERENCES ANOTHER COMPANY'S UNIT, DRIVER OR CARD. REFUSE IT. (CC-1)

Owner, 2026-10-03: *"we do not use another company's unit. Trucking and Transportation are not operating
anymore."*

CC-1 found a **fuel-card assignment that accepted another company's unit or driver**. That is a cross-company
money path and it is now closed by refusal, not by a fix to one form:

- A fuel-card assignment, a load, a settlement, an expense, a bill, a work order or a posting on USMCA may
  reference **only** a USMCA unit, driver, trailer and card. A reference to a TRANSPORTATION or TRUCKING row
  is **refused in the database**, not validated in a screen.
- This is the companion to 369.1's frozen-company **write** refusal. That one stops us writing INTO a frozen
  company; this one stops us pointing AT one. **Both are needed. Neither replaces the other.**
- Trucking owns the assets and leases them to USMCA — the **lease** is the relationship, recorded through
  `lease_recovery` / `rent_expense` on 5800, and that is the only correct cross-entity path.
- **Required value:** 0 USMCA records referencing a frozen company's unit, driver, trailer or card; the
  refusal proven by attempting one and being refused.
- **Guard:** `verify-no-usmca-record-points-at-a-frozen-company.mjs`.

## 373.6 — CC-1'S LOAD STAMP: THE COLUMN IS LIVE, THE VALUES ARE NOT YET

Measured just now: `accounting.journal_entry_postings.load_id` **exists on production**, and
**0 postings carry a value**. That matches CC-1's own report — merged, awaiting the deploy that lets the
posters write it. **No one reports the stamp as done until that count is non-zero on real postings.**

---

**Order, and it is tight because the owner is testing on live rows right now:**

1. **373.2** — the three writers, **before** the reclassify tab ships
2. **368.1 / 370** — the reclassify tab with real derived balances and a working register
3. **373.3** — backfill the 3,908, then arm the refusal
4. **373.4** — deposits, then credit memos and vendor credits
5. **373.5** — the cross-company refusal
6. The runbook in ROUND 366

Finish your list. No hand-offs. Three numbers at the top of every report.
