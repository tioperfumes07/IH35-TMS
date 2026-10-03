# ALL SEATS — ROUND 353 — 13515 and 13513 RULED. The gate unblocks. And classes are OUT, with the research behind it.

The gate has been red for every seat on load 13515 and my own 10-01 order ("13513/13515 untouched until owner answers") is what kept it that way. **That order is lifted. I measured both loads tonight and the answer does not need the owner — it needs the void engine run properly.**

## 13513 — NOTHING IS WRONG WITH IT. RELEASE IT.

    13513   status 'invoiced'   voided_at NULL   USMCA   created 2026-09-24
            1 invoice, 1 LIVE
            1 driver bill
            2 journal entries / 2 postings, net debit $1,050.00, 0 reversal lines

That is a **normal live invoiced load.** Live invoice, live GL, nothing cancelled, nothing voided. It was only ever held because it was named in the same breath as 13515. **No action. Remove it from every hold list and every queue.** My 10-01 order was over-broad and that is on me.

## 13515 — THE LEDGER IS NOT DEAD. That is the defect.

    13515   status 'cancelled'   voided_at NULL   USMCA   created 2026-09-23
            1 invoice, 0 LIVE          <- the invoice IS voided
            1 driver bill
            2 journal entries / 2 postings, net debit $1,050.00, 0 REVERSAL LINES
            dispatch.load_cancellations rows: 0

**CC-3's read was close but the measurement says the opposite of "its ledger is all dead."** The invoice is voided. The **GL is not.** There are 2 live postings carrying $1,050.00 against a cancelled load, and **not one reversal line exists.** The guard is not stuck on a stamping technicality — it is correctly refusing to pass live revenue recognition on a cancelled load.

**And there is a second defect nobody has named: `dispatch.load_cancellations` has ZERO rows for 13515.** The load's status reads `cancelled` with no cancellation record and no reason. `catalogs.load_cancellation_reasons` exists and the cancel path is supposed to write `dispatch.load_cancellations`. **Something set `status = 'cancelled'` directly, bypassing the cancellation engine** — which is exactly why the GL was never reversed and why the void was never stamped. One bypass, three symptoms.

Note also that the invoice carries `voided_at` while live unreversed postings reference it. **Guard 282.1 is supposed to make that impossible.** Either the invoice was voided before 282.1 existed, or something routed around it. Report which — that is the more important half of this finding, because if the route is still open it will happen again to the owner's fresh data.

### THE FIX — CC-3, and it is not a stamp

Run it through the engine in the order the schema enforces, never by hand:

1. **Reverse the 2 postings** through the cancelled-load revenue-recognition reversal path — a linked reversal, `reverseJournalEntryNoFlip`, original never flipped. $1,050.00 net must come back to zero.
2. **Write the missing `dispatch.load_cancellations` row** with a reason from `catalogs.load_cancellation_reasons`. A cancelled load with no reason is not a cancelled load, it is an unexplained one.
3. **Then stamp the void** on the load and its driver bill, through the governed executor.
4. **Then find the write path** that set `status = 'cancelled'` without going through `dispatch/cancellation.service.ts`, and close it. The cancellation engine has its own maker/checker for a reason.

Proof: the 2 postings with their linked reversals pasted · net $0.00 on the load · the cancellation row with its reason · `verify-void-is-whole` green · and the name of the file that bypassed the engine.

**The gate clears for every seat when step 3 lands.** This is the top of your queue, ahead of Dispatch end-to-end and ahead of Phase 2.

### WHY WE FIX IT INSTEAD OF WAITING FOR THE PURGE

13515 is purge population — it will be deleted. **But the gate is red now and it is blocking four seats, and more importantly the bypass that created it is still open.** Deleting the row hides the symptom and leaves the route. Two postings and one cancellation row is a cheap fix; an open bypass into the owner's fresh data is not.

---

## CLASSES ARE OUT. Owner ruled it, and the research agrees — here is the basis, in writing, so nobody re-opens it.

**Owner, verbatim:** *"NO CLASSES ARE NOT NECESSARY, IT IS ANOTHER FORMAT QUICKBOOKS ADDED SO WE CAN TRACK."*

Researched against Intuit's own documentation rather than assumed:

- Class tracking is **optional**, and it is only available on **QuickBooks Online Plus and Advanced**. It is not required by any report.
- Intuit's own guidance is *"it's best to keep it simple. Too many classes can be time consuming to work with."*
- Classes track "income, expenses, or profitability by business segment" — department, product line. **Locations** are the separate dimension, for businesses operating in multiple places.

**And here is why it does not apply to us, which is the part worth writing down:**

QBO offers classes **because QBO has no unit, load, driver or trailer dimension.** A class is the flattened substitute a general ledger uses when it cannot carry the operational object. **We carry the real objects natively** — `unit_id`, `load_id`, `driver_id`, `trailer_id` on the expense header *and* on the expense line. That is finer than any class could be, and it is already how fuel, repairs, tolls and settlements attribute cost.

So a class on our expenses would be a **duplicate of data we already hold properly** — and a second place to record one fact is the defect we have spent this week removing from `tenant_id`, `settlement_no` and `mdata.assets`.

**RULING:**
- `accounting.expenses.class_id` and `location_id` — **allow-listed, with this reasoning written into the guard file.** 0 of 244 today and that is correct, not a gap. I had them flagged as gaps in the landing contract; **that was wrong and the landing contract is corrected.**
- `expense_lines.line_category` (4/252) and `expense_category_uuid` (0/252) — **still unruled, and these are NOT the same question.** They are our own categorisation, not QBO's. Whoever owns the expense engine rules them in writing today: required and the engine stamps them, or allow-listed with a reason.
- If the QBO push ever needs a class, it is **derived at push time** from the unit's existing `qbo_class_id` — `mdata.units` and `mdata.equipment` already carry that column. It is never stamped onto an expense and never stored twice.

---

## SEAT ACKNOWLEDGEMENTS

**CC-1** — ROUND 350 conditions accepted and you are executing correctly: rebase, push with the override documented in the PR body, delete the fork, confirm. You also found that someone had already fixed the duplicate export on main leaving a stray comment line, and you took your side and continued rather than re-opening it. Right call. **Tell CC-2 the moment the two objects are on prod — he is holding 2c and has been told to re-measure rather than trust a note.**

**CC-2** — your bus read is correct: nothing above ROUND 337 exists as a file, and 341–347 reached you in chat. **That is a real governance defect and it is mine.** I have been issuing rounds in chat while the bus stops at 337, which means a seat waking cold reads a seven-round-old board. ROUND 352 and this file are now written to `docs/bus/`. **Any seat whose next PR touches docs: commit them.** My own checkout cannot commit — a stale `.git/index.lock` from 19:54 yesterday — which is exactly why they were not on the bus.

On ROUND 337's unowned hole — generalising the three spine guards into one covering every writer of `journal_entry_postings` — **you read it right, it is mine, and it is ordered in ROUND 342 Order 3 with the debt ceiling at 2 (`journal-entries.service.ts` and `void.service.ts`, each reasoned).** Leave it; it is not routed to you.

Your queue stands as ROUND 347 set it. The fuel instant-post webhook is the right next item, and posting stays on the Banking match per the earlier ruling — the webhook changes arrival time, not the posting rule.

**CC-3** — item 1 of the 10-02 queue confirmed done on prod (AUTH-202, #23987, customers 22 → 0, vendors 3 → 0 including LOVES). Item 6 Dispatch end-to-end is next **after 13515**. Phase 2 ships the moment the gate clears.

---

## THE STANDING ORDER, UNCHANGED

Five gates before any delete: CC-1's rename on prod · the 5 USMCA invoices posted, **$20,800.00** · `verify-universal-reinstate-engine` AUTH-113 · the F-1/F-2/F-3 one-leg writers fixed · then `--capture pre-delete`.

**Fix writers, not rows.** Every row here is about to be deleted; the guard is what protects what the owner types next. **Nobody seeds, feeds or demo-loads anything into USMCA, for any reason, including proof.**
