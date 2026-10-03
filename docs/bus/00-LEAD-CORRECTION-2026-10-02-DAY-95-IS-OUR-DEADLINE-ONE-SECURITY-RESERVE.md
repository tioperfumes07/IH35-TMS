# LEAD CORRECTION — 2026-10-02 — DAY 95 IS OUR DEADLINE, NOT FARO'S DEDUCTION. ONE SECURITY RESERVE.

**I WAS WRONG AND I AM CORRECTING IT IN THE SAME HOUR.** My earlier line "there is no day 95" is
**void**. Day 95 is in the agreement. What is not in the agreement is a day-95 *reserve deduction*.
Read from the source myself — the Faro Factoring Agreement definitions carried verbatim in
`~/Desktop/CPA ANSWERS.docx` — not from any agent's doc:

```
line 227  Repurchase Deadline:
line 228  The date by which Seller shall cause a Purchased Account to become a Repurchased Account
line 229  Repurchase Deadline: 95 calendar days from the Purchase Date.
line 233  …in the event Seller breaches any term … and fails to cure same upon 5 business days
          written notice, then Faro has the right to accelerate the Repurchase Deadline for any or
          all Purchased Accounts and declare same immediately due.
line 231  Seller may cancel any Transaction, so long as Seller returns the Purchase Proceeds plus any
          Transaction Fees … within 2 business days of Seller's receipt of the Purchase Proceeds.
line 244  SHOULD SELLER OR EQUITY HOLDER RECEIVE ANY PAYMENT ON A PURCHASED ACCOUNT, SAID PAYMENT
          SHALL BE FORWARDED TO FARO WITHIN 1 BUSINESS DAY OF RECEIVING SAME.
```

**The full contract clock, every number citable:**

| Day | What the contract says |
|---|---|
| 1–30 | **Repurchase Term** — 30 calendar days from the Purchase Date |
| 31–35 | **Grace Period** — 5 calendar days, no interest accrues |
| 36 onward | **Default Interest** 0.067% per day, **compounded daily**, on the unpaid balance |
| **95** | **Repurchase Deadline — the date by which WE must cause the repurchase.** 95 calendar days from the Purchase Date |
| any time | Faro may **accelerate** the Deadline on an uncured default, after **5 business days' written notice** |

## 1. WHAT DAY 95 IS, AND WHAT THE JOB MAY DO

Day 95 is **our obligation**, not Faro's action. By then the Purchased Account must have become a
Repurchased Account — meaning **Faro has actually received, in good and collected funds, the Net
Amount plus all unpaid Transaction Fees plus all Default Interest**. That money comes from the
customer paying, or from us if the customer has not.

**The day-95 job's only legitimate output is a "repurchase due" obligation event. It posts nothing.**
No journal entry, no posting, no relief of the Factoring Advance, no reserve movement. And per the
owner this hour — *"WHEN RECOURSE TIME ARRIVES IT MUST ASK, NOT RECOURSE AUTOMATICALLY, SOMETIMES THE
FACTORING COMPANY STILL GIVES EXTRA DAYS"* — the event surfaces as a **row in the decision queue the
owner answers**. Extend, confirm, or mark collected. Never an automatic action, and no default action
on timeout.

**There is no day-95 reserve deduction anywhere in this contract.** Any code, order or ruling that
assumes Faro takes money out of our reserve on day 95 is wrong, mine included. Delete that assumption.

## 2. THE RESERVE IS HELD UNTIL REPURCHASE — IT IS NOT A DAY-95 FUNDING SOURCE

Quoted: *"Faro has no obligation to release a Transaction's Security Reserve that has been collected
and/or converted to cash on deposit unless: a) Faro has been paid or collected the applicable
Repurchase Price, b) Seller is not in default … c) Equity Holder(s) is/are not in default."* And:
*"Faro shall never have an obligation to release a Security Reserve for a Transaction that has not
been converted to cash on deposit."*

So the reserve **cannot be both held and deducted for the same Transaction**. It is held per
Transaction until that Transaction's Repurchase Price is collected, and then releasable — and Faro may
release earlier at its sole discretion. **Reserve money leaving only ever means one of two things: a
release to us, or something Faro chose to apply. Either way the posting comes from the actual bank
line Faro sends, matched in Banking. Never from a timer, never from an assumption.** No pooled
"releasable" figure — releasability is per-Transaction, with all three contract conditions satisfied.

## 3. ONE SECURITY RESERVE. 1235 AND 1236 ARE TWO ACCOUNTS FOR ONE CONTRACT CONCEPT.

**"Cash reserve" does not appear in this agreement. The only reserve the contract names is the
Security Reserve: 1.5% of the Net Amount of each Purchased Account, deducted from the Purchase
Price.** The finding that Faro holds it as escrow on 83 purchases and as cash on 6 is exactly that —
**the same 1.5%, presented by Faro in two buckets.** It is one asset.

**RULING, and this is the permanent fix, not a patch:**

- **ONE GL account for the Security Reserve: 1230, named "Factor Reserve Holdback"** (ACCT-F9633 —
  named so the next person searching for the factor's holdback cannot miss it, which is how the
  duplicate got created on 09-30).
- **1235 and 1236 both retire into it.** Faro's two buckets become a **presentation attribute on the
  reserve-ledger row** — `faro_bucket: escrow | cash` — carried for statement tie-out. **A
  presentation difference on a statement is never a second GL account.** That is the whole lesson of
  this week: one concept, one account, or Factoring and Banking disagree by construction.
- The word **"escrow" never appears on a factoring account, role, column, label or tab.** The CPA
  answers, in the owner's words: *"escrow is a current liability"*, *"factoring is an asset"*,
  *"driver escrow has nothing to do with faro."* **Driver escrow is the 2100 series and has no Faro
  role, no Faro bank account and no factoring posting, ever.** If a migration landed today roling
  escrow to a factoring account, it is **reversed**, not built upon.
- Any retirement of 1235 or 1236 follows the same rule ACCT-F9633 follows: **assert first, refuse
  loudly if the account carries postings, a bank account, a role or a binding.** A chart-of-accounts
  row with history behind it is never deleted — it is deactivated and hidden, and the reference is
  repointed.

## 4. THREE MORE CONTRACT OBLIGATIONS THAT NEED ENGINES — NOT ONE OF THEM IS BUILT

- **Misdirected payment, 1 business day.** If we or the Equity Holder receive any payment on a
  Purchased Account it must be **forwarded to Faro within 1 business day**. Build it: a customer
  payment landing in our bank on an invoice Faro purchased raises an alert the moment it is matched in
  Banking, with the deadline date on the row. Missing this is a breach that triggers the acceleration
  clause above. Nothing posts automatically; it asks.
- **Cancel right, 2 business days.** We may cancel a Transaction by returning the Purchase Proceeds
  plus Transaction Fees within **2 business days** of receiving the proceeds. Surface it on the
  advance while the window is open, with the exact amount and the expiry date, and grey it out after.
- **Acceleration, 5 business days' written notice.** An accelerated Deadline is a date the app must be
  able to carry per Purchased Account, recorded with the notice date. The 95-day Deadline is the
  default, not a constant.

## 5. THE CONTRACT-TERMS TABLE IS THE ONLY PLACE THESE NUMBERS LIVE

`30` · `5` calendar · `0.067%` daily compounded · `1.5%` · `95` calendar · `5` business ·
`2` business · `1` business. Each row carries its contract citation. **No engine hard-codes a
factoring number that is not in that table, and no number goes in the table that nobody can quote
from the agreement.** That rule is what would have caught the day-95 deduction before it was built.

## STANDING

Nobody posts transactions, seeds, feeds, matches or categorizes. Build only, 100% per seat, no
handoffs. The owner verifies in Chrome when every build is complete; nobody else verifies. Holding
work until a correction lands was the right call — **this is the correction. Resume.**
