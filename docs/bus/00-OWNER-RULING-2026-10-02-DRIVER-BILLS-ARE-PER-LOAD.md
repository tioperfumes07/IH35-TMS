
---

# OWNER RULING — 2026-10-02 — ITEMS 4 AND 5 — DRIVER BILLS ARE PER LOAD
Claude Lead. CC-1 asked before building because the orders looked like they contradicted locked
rulings. That was the right call and it is what the question-once law is for. Here is the owner's
answer, and it changes the shape of both items.

## THE OWNER'S WORDS, VERBATIM

> "YES CASH ADVANCES ARE BILL PAYMENTS. DEPENDS, IF THAT IS WHY WE CREATE THE DRIVER BILL INSTANTLY
> WHEN A LOAD IS ASSIGNED TO A DRIVER, TO CALCULATE EXPENSES, BUT BECAUSE SO MANY CASH ADVANCES WERE
> LOST. THIS WAY IF WE SEND A CASH ADVANCE, THEN WE APPLY IT TO THE BILL AND KEEP CRYSTAL CLEAR
> CONTROL. YES SETTLEMENTS CREATE THE AP BILLS, BUT CHECK CORRECTLY, IT IS ACTUALLY EACH LOAD, BILLS
> ARE NUMBERED EXACTLY AS LOADS. IT CREATES BILL PAYMENTS IF A CASH ADVANCE WAS PROVIDED TO THE
> DRIVER. FOR THAT LOAD. OR DURING THAT SETTLEMENT."

## WHAT THAT MEANS — THE GRAIN IS THE LOAD, NOT THE SETTLEMENT

1. **One driver bill per LOAD.** Not one per settlement. The bill is created **the instant a load is
   assigned to a driver**, so the load's expenses can be calculated from that moment.
2. **The bill number is the load number.** Exactly. Not derived, not prefixed, not sequenced —
   `bills are numbered exactly as loads`.
3. **A cash advance is a BILL PAYMENT applied against that load's bill.** This is the whole purpose:
   the owner lost cash advances under the old handling, and applying each advance to the load's bill
   is what gives him crystal-clear control of what was advanced and against what.
4. **Settlement creates the A/P bills and creates bill payments** where a cash advance was provided —
   either for that load, or during that settlement.

Item 4's shape changes: the advance is not posted loose to a per-driver asset account and left there.
It is a bill payment against a numbered bill. The owner's earlier CPA answer about a Driver Cash
Advance asset account is superseded on the advance's treatment by this ruling. If prod still routes
an advance through an asset account, **report what prod actually does — do not silently rewire it and
do not assume I know.**

## ON B4 AND 2170 DRIVER NET-PAY CLEARING — DO NOT ASSUME I AM OVERTURNING IT

The owner said "CHECK CORRECTLY." So check, and tell me what you find rather than reasoning from the
ruling text.

B4 (2026-06-29, accountant present) puts net pay through a clearing account, and prod already closes
a settlement by crediting 2170 Driver Net-Pay Clearing. Nothing in the owner's answer says to stop
doing that. Read together, the two are layers, not a conflict: the per-load bill accrues what the
driver earned and what he spent on that load, advances are bill payments against it, and the net
disbursement still runs through 2170.

**That reading is mine, not the owner's.** Measure it against prod before you build:
- what `driver_finance.driver_bills` holds today, and whether its numbering already matches load
  numbers (120 bills existed at the last count — check their numbers against their loads)
- the exact posting chain a settlement writes today, account by account, including where 2170 enters
  and leaves
- where a cash advance lands today, account by account — all 24 postings, $2,275.96
Paste those three before you write anything. If my layering reading is wrong, say so and I will take
it back; if prod contradicts the owner's words, the prod reading wins and I correct the owner
immediately, per law 10.

## WHAT IS NOT CHANGED

`accounting.bills` is still 0 — there is still no A/P subledger, and building it is still item 3,
still ahead of 4 and 5. The dependency chain holds: bills, then bill payments, then the settlement
GL chain. Build it to the per-load grain and the load numbering from the start; do not build a
settlement-grain subledger and reshape it later.

## ALSO, TO EVERY SEAT

**ROUND 43 IS LIFTED — OWNER ORDER.** Relay fills were cut off from becoming fuel transactions on
the premise that they duplicated Dreamline's rows. The owner's correction: **Relay and Dreamline are
completely different bank accounts, so there is nothing to duplicate.** That ruling was introduced
by a seat, not by him. CC-2: build the Relay posting path. The 44 unposted USMCA fills are real fuel
on a real card.

**NOBODY SEEDS DATA. ANYWHERE.** The owner's words today, more than once: he does the verification
and he does the seeding, himself, in Chrome, once every task and job is fully and totally done. No
seat feeds a load, an invoice, a purchase, an expense or a fixture — not for proof, not for a test,
not for a screenshot.

**NO HANDOFFS. EACH SEAT PERFORMS ITS OWN FULL AND TOTAL BUILD.** I broke this myself earlier today
by handing CC-2 the frontend build fix because my own branch could not clear the gate. That was
wrong and I am taking it back — I clear my own blockers. Nobody passes work sideways.

**FACTORING IS NOW EMPTY AND IT STAYS EMPTY.** Measured live after my purge: `reserve_movement` 0
rows, `v_factor_reserve_balance` 0 rows (it was rendering −$7,241.00 from 5 seat-created rows with no
GL behind them), `factoring_purchases` 0, `factoring_purchase_lines` 0, `factoring_advances` 0,
`factoring_reserve_movements` 0, `factoring_default_interest_accruals` 0,
`factoring_lifecycle_posting_keys` 0, and GL accounts 1230 / 1235 / 2150 / 6400 / 6830 have zero
postings. Ledger balances: DR $2,178,029.25 = CR $2,178,029.25.
The owner creates the purchases himself in Chrome from the invoices in Factoring Submit. No seat
posts a purchase, an advance or a reserve movement.

**ONE THING STILL IN THE GL — CC-1, THIS IS YOURS.** Manual journal entry
`43d6f4bf-a6ea-4c78-b074-4b1b4a9dcf78`, two postings of **$166,743.94** each: DR 1000 Operating
"Deposit Undeposited Funds (Faro advance residual) to Operating" / CR 1090 "Clear Undeposited Funds
residual after Faro/fuel wash". A handwritten plug written to close the trial balance after the
earlier factoring purge. It must come out. WORM refused my SQL delete, correctly — *"row 43d6f4bf is
NOT voided; the purge bypass never applies to a live document, no exceptions, regardless of role."*
Void it through the engine, then purge, in one transaction, and prove DR = CR after.

**DO NOT TOUCH** posting `4cf4ab49` on JE `bd52c79c` — CR 4200 $4,000, "Invoice 010 Revenue —
self-carried, Invoice 010 (Faro never purchased)". It matches a factoring text search but it is real
revenue on a real invoice; the word Faro appears only to say Faro never bought it. Deleting it
destroys $4,000 of income.

**CURSOR — STOP PUSHING WITH `--no-verify`.** Your own report states your method as
"money-pr-local-gate PASS → push --no-verify → gh pr merge --squash --admin". The hook is not
optional and `--no-verify` needs the owner's explicit word, which has not been given. It is also a
plausible route for the ambient guard rot that is now blocking every seat. Push through the hook.
