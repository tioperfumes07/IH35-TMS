# RETRACTION — **I WAS WRONG. THE A/P AND THE GL ARE THERE AND CORRECT. THE OWNER IS RIGHT.**
**Claude Lead · 2026-09-28 04:55 AM CT (09:55Z) · measured live, `br-fancy-credit-akjnd07a`, USMCA**

## WHAT I SAID, AND WHY IT WAS WRONG
I said *"the general ledger has no A/P"* and *"$48,864.07 is invisible to the GL."*
**That was wrong.** I read one role account (`ap_control` → 2000) saw it net to zero, and
concluded the liability was missing. I never checked where the liability actually sits.
The owner pushed back and the owner was right.

## WHAT IS ACTUALLY LIVE — THE LIABILITY LEDGER, MEASURED
```
2000        Accounts Payable (A/P)               170 postings   dr 5,053.19  cr 5,053.19  net 0
2150        Factoring Advance                    383 postings   net credit  311,857.62
2170        Driver Net-Pay Clearing              234 postings   net credit   71,215.96
2510        Dreamline Diesel Card Payable        663 postings   net credit  145,431.11
2100-00-*   Driver Escrow leaves (16 drivers)    posting, balanced per driver
2175-00-*   Driver Reimbursement leaves (10)     posting
```
**Vendors, the chart of accounts, the per-driver escrow leaves, the reimbursement leaves,
factoring and the fuel-card payable were all created correctly and are all posting.** Nothing
was missed. 2000 nets to zero because the vendor bills that ran through it were paid — that is
a correct A/P account, not an empty one.

## THE REAL DEFECT — NARROW, AND THE OPPOSITE OF WHAT I SAID
I traced every one of the 90 held bills to the pay-run JE its `posting_hold_reason` names:
```
ALL 90 bills point at JEs crediting  2170 Driver Net-Pay Clearing   $139,885.41
                              plus   7200 Driver Admin Fee income (87 bills)
                                     1245 Driver Cash Advances Receivable (21)
                                     2100-00-* per-driver escrow (the deduction legs)
```
**The money is already in the general ledger, in the right accounts, with the right legs.**
These are driver-settlement bills: their liability belongs in **2170 Driver Net-Pay Clearing**,
not in 2000 A/P. That is correct accounting, not a gap.

So the two red health checks are **not** a missing-money defect:

**1. `ledger.ap_tieout` — THE CHECK ITSELF IS COMPARING THE WRONG TWO THINGS.**
It measures GL `ap_control` (2000) against **every** open bill. But driver-settlement bills
never touch 2000 by design — they credit 2170. The check's subledger side includes bills whose
liability is deliberately elsewhere, so it can never tie. **Fix the check's scope**, do not move
real money to satisfy a bad comparison.

**2. `ledger.posted_without_posting` — A LINKAGE GAP, NOT A POSTING GAP.**
The A/P adoption pointed each bill at an existing JE but never stamped that JE's postings with
`source_transaction_type='bill'` / `source_transaction_id=<bill id>`. The check looks for that
stamp, finds none, and reports 90 bills with no GL. **The GL entries exist. The back-reference
from bill to posting does not.** This is exactly the owner's standing demand — *full linkage and
connectivity, double routed, reverse* — and it is a linkage repair that creates **no new money**.

## THE TRAP I ALMOST WALKED CC-2 INTO
My first instinct was to release the 90 holds and post the bills. **That would have credited
2170 a second time — roughly $139,885.41 of double-counted liability** on top of what is already
there. I warned CC-2 not to mass-release and to publish the split first. **The split is now
measured and the answer is 90 of 90 already in the GL.** Nothing posts. Order corrected before
anyone touched production.

## THE CORRECTED WORK
1. **Stamp the linkage.** Back-fill `source_transaction_type='bill'` / `source_transaction_id`
   on the existing postings of the 90 named JEs. No new JE, no new amount, no money moved.
   Then clear `posting_hold_reason` and set each bill's status from its real paid state.
2. **Re-scope `ledger.ap_tieout`.** Either exclude driver-settlement bills from the 2000
   comparison, or tie them to **2170** as their own control. Whichever — it must compare a
   control account to the subledger that actually lands in it.
3. **Guard:** `verify-every-bill-posting-carries-its-source-link.mjs` — a bill whose liability
   is in the GL with no `source_transaction_id` back-reference is the defect class. That is the
   permanent fix, and it is a linkage guard, not a money guard.

## THE LESSON, RECORDED
One role lookup is not a trial balance. I reported a $48,864.07 hole in the books off a single
`ap_control` resolve without asking where the money went instead. **The owner's correction
prevented a $139,885.41 double-posting.** Before reporting money missing, read the whole
liability side first.
