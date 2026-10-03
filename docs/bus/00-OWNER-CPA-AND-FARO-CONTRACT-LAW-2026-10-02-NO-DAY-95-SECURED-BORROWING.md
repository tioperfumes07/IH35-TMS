# ALL SEATS — CONTRACT LAW READ FROM THE SOURCE — 2026-10-02 — THREE CORRECTIONS, ONE OF THEM MINE

OWNER: "you read the contract on the cpa answers file." I did. Source: `~/Desktop/CPA ANSWERS.docx`,
which carries the owner's CPA answers AND the Faro Factoring Agreement definitions verbatim. Every
number below is quoted from that file. **Nothing here is from memory and nothing is from another
agent's doc.** Where it contradicts anything I or any seat wrote earlier today — including my own
ruling — **the contract wins and the earlier text is void.**

---

## CORRECTION 1 — THERE IS NO DAY 95. THAT THRESHOLD IS NOT IN THE CONTRACT.

Quoted from the agreement:

| Term | Contract value |
|---|---|
| **Repurchase Term** | **30 calendar days** from the Purchase Date |
| **Grace Period** | **5 calendar days** — interest does not accrue even though the Repurchase Term expired |
| **Default Interest Rate** | **a daily interest charge of 0.067%**, **compounded daily** |
| Default Interest starts | after the expiration of the Repurchase Term **and** Grace Period |
| **Security Reserve** | **1.5% of the Net Amount** of each Purchased Account |
| **Purchase Price** | Net Amount − (Factoring Fee + Security Reserve) |
| **Purchase Price Proceeds** | Purchase Price − Transaction Fees (wire fees, NSF, UCC, collection, attorney, postage, court) |
| **Repurchase Price** | Net Amount + all unpaid Transaction Fees + Default Interest − credits |
| Becomes a **Repurchased Account** | only when Faro receives, in good and collected funds, the Net Amount **plus** all outstanding Transaction Fees **plus** all Default Interest |

**So: 30 + 5 = day 36 is when Default Interest begins. Any "day-95 recourse job" is a threshold
nobody can quote from the contract. Delete it.** Recourse is not a calendar event — it is driven by
the **Repurchase Price remaining unpaid**, and the amount recoursed is the **Repurchase Price**, not
"gross plus interest" loosely stated.

Also quoted, and it governs every reserve-release screen: *"Faro has no obligation to release a
Transaction's Security Reserve … unless: a) Faro has been paid or collected the applicable Repurchase
Price, b) Seller is not in default or breach … c) Equity Holder(s) is/are not in default."* And:
*"Faro shall never have an obligation to release a Security Reserve for a Transaction that has not
been converted to cash on deposit."* **A reserve is releasable only per-Transaction, only once that
Transaction's Repurchase Price is collected. No pooled "releasable" figure.**

---

## CORRECTION 2 — MY OWN RULING WAS WRONG ON A/R. THIS IS A SECURED BORROWING.

CPA answer, first line of the file: *"a true sale of receivables or a secured borrowing. **It is a
secured borrowing, because it is recourse.**"*

I ruled earlier today that recourse should "DR the receivable back from the customer." **That is
void.** Under secured borrowing the receivable **never left our books**, so there is nothing to bring
back and booking it would double A/R. The correct structure, from the CPA answers:

*"Liability — **Factoring Advance**, Reserve asset is **Factoring Reserves**, Factoring Fees,
Chargebacks should be created as **Factoring Recoursed Invoices**."*
*"reserves we usually create an asset account — **Factoring Reserves**"* … *"Reserve should be short
term because from reserves they pay us every certain days"* → **current asset.**

So on recourse: the A/R moves **from A/R to Factoring Recoursed Invoices** — both ours, both
customer-stamped — and the **Factoring Advance liability is relieved by the Repurchase Price**. That
part of the corrected posting I was handed is right, and my version was not.

---

## CORRECTION 3 — "FARO ESCROW RESERVE" IS STILL WRONG, AND THE CPA ANSWERS SAY SO TWICE.

I was told the escrow role correctly points to 1236 "Faro Escrow Reserve." The owner's own CPA answers
say otherwise, in his words:

- *"**the escrow is a liability and factoring is an asset.** Reserve should be short term…"*
- *"**escrow is a current liability**"*
- *"**driver escrow has nothing to do with faro.**"*
- the reserve asset's name in the same file is **"Factoring Reserves"** — never "escrow."

And the owner, this session: *"WHAT THE FUCK DOES ESCROW HAVE TO DO WITH FARO FACTORING OR RESERVE
ACCOUNTS."*

**Therefore: the factor's Security Reserve is an ASSET and its account is 1230 (ACCT-F9633 renames it
"Factor Reserve Holdback" so the next grep for the factor's holdback cannot miss it). Driver escrow is
a CURRENT LIABILITY in the 2100 series and has no Faro role, no Faro bank account and no factoring
posting, ever.** An "escrow" role pointing at a factoring asset puts a liability concept on an asset
account — opposite sides of the balance sheet — and that mislabel is the documented cause of the
duplicate account created on 09-30 (migration 202615000000 recorded in its own comment that it
searched `'%Escrow Reserve%'` and `'%Faro%Escrow%'`, found nothing, and created a second account
beside the real one). **Do not credit "1236 Faro Escrow Reserve" in any recourse entry. Credit the
factor reserve asset and the Faro cash reserve.** If a migration landed today that roles escrow to a
factoring account, it is reversed, not built upon.

---

## THE RECOURSE POSTING, CORRECTED AGAINST THE CONTRACT

Nothing posts on a timer. The bank line on the reserve account, matched in Banking to the Purchased
Account, posts all of this in **one transaction or none of it**:

1. **Relieve the borrowing** — DR **Factoring Advance** (liability) for the **Repurchase Price** of
   that Purchased Account: Net Amount + unpaid Transaction Fees + accrued Default Interest − credits.
2. **Fees and interest** — only a **new** charge Faro levies at that moment goes to factoring fee /
   interest expense. Default Interest already accrued and already booked is not booked twice.
3. **Credit what Faro actually took, from the account it took it from** — the **factor reserve asset**
   and the **Faro cash reserve**, split exactly as the statement shows.
4. **Move the receivable, do not recreate it** — DR **Factoring Recoursed Invoices**, CR **A/R**,
   customer-stamped and invoice-stamped. The customer still owes us; the financing is simply no longer
   against that invoice.
5. **Status** — invoice and advance set to **`recourse_returned`**, the value the code already uses.
   Never a new string.
6. **Reserve ledger** — write a "used by recourse" row against that Transaction so the amount can
   never again be shown as releasable or released twice.
7. **Mismatch** — if what Faro took does not equal what is owed on that Transaction, **nothing
   posts**; it is reported, because Faro may take the balance out of a later funding.
8. **Reverse route** — unmatching reverses through the one void/reversal engine and returns the
   invoice and advance to their prior state. Never a delete, never a flag flip.

**Releases go one way only.** Either the Banking transfer or the release poster — never both, or the
release counts twice. **Use the Banking transfer: these are bank accounts.** Retire the other path.

---

## TWO MORE CONTRACT/CPA RULINGS THAT TOUCH THE MONEY ENGINES

- *"C5 — **CORRECTED: the COMPANY absorbs factoring chargebacks, NOT the driver.** Drivers are company
  drivers, not owner-operators. Do not push factoring recourse/chargebacks to drivers."* And: *"remove
  any path that charges a driver for a factoring chargeback."* **CC-1: if any settlement, driver-bill
  or deduction path can route a factoring recourse to a driver, delete it and guard it.** Fuel
  overage, damage and fines ARE driver-fault recoveries and stay — a factoring chargeback is company
  financing risk.
- *"C3 — Faro is also a full vendor (advance stays a factoring liability; vendor record handles
  fees/chargebacks A/P)."* So Faro carries both: the **Factoring Advance liability** for the
  borrowing, and a **vendor record** for fees and chargebacks through A/P.
- *"C2b — Escrow cap = $2,500 (live code caps $2,000 today → coder changes to $2,500)."* Driver escrow
  only. Still unrelated to Faro.
- *"A1 — Alert after 7 days unmatched (single threshold, not 30/90)."*

---

## STANDING

Nobody posts transactions. Full and total build only — complete wiring, linkage, connectivity,
double-route and reverse-route to customers, vendors, driver, truck, trailer, load, settlement,
factoring, A/P, A/R, chart of accounts, JE and GL, every row stamped both ways. The owner verifies in
Chrome when every build is complete; nobody else verifies and nobody feeds data. No `--no-verify`, no
baseline additions, no `ALLOW_OFFLINE_SKIP` on a money guard, no test/sample/demo row in USMCA.

**Every factoring constant goes in the contract-terms table with its contract citation — 30, 5,
0.067%, 1.5% — and no engine hard-codes a number that is not in that table. A number no one can quote
from the agreement does not go in the code.**

---

# AMENDMENT — OWNER, THIS HOUR — RECOURSE ASKS. IT NEVER RECOURSES BY ITSELF.

OWNER, VERBATIM: **"WHEN RECOURSE TIME ARRIVES IT MUST ASK, NOT RECOURSE AUTOMATICALLY, SOMETIMES THE
FACTORING COMPANY STILL GIVES EXTRA DAYS, ETC."**

This is law and it closes the design. **No job, timer, cron or scheduled task may recourse an invoice.
Nothing automatic. Ever.** The contract's day 36 is when Default Interest begins — it is **not** an
instruction to recourse, and Faro routinely grants more time.

**BUILD — THE RECOURSE DECISION QUEUE.** When a Purchased Account passes its Repurchase Term plus
Grace Period it appears in a queue as a **row the owner answers**. Rows, not cards. Columns: customer ·
invoice · load · purchase date · day 36 date · days past · Net Amount · advance outstanding · fees ·
Default Interest accrued · **Repurchase Price now** · reserve on hand · state. 120px money, 132px
dates, em dash for missing, gear column chooser.

The three answers, and nothing else:

1. **EXTEND / EXTRA DAYS GRANTED.** Records a new expected date, who granted it, the date granted, and
   a note. The row leaves the queue and returns on the new date. **Posts nothing.** An extension can be
   granted again, and every extension is kept — the history is the audit trail, never overwritten.
   Default Interest **keeps accruing per the contract** through an extension unless Faro actually
   waives it, and a waiver is only recorded from Faro's own statement as a **credit** against the
   Repurchase Price. Never assumed because days were granted.
2. **CONFIRM RECOURSE.** Enabled **only** when a matching reserve bank line exists in Banking for that
   Transaction. Confirming matches the line and posts the entry in the eight steps above, in one
   transaction or none. **Greyed out with the reason shown when no bank line exists** — "no reserve
   deduction from Faro on this Transaction yet." The button never invents the cash.
3. **MARK COLLECTED.** Faro received the Repurchase Price; the Transaction becomes a Repurchased
   Account and its Security Reserve becomes releasable — per contract, **only** that Transaction's
   reserve, only once converted to cash on deposit, and only with no Seller or Equity Holder default.

**NO DEFAULT ACTION ON TIMEOUT.** An unanswered row stays in the queue and ages. It does not recourse
itself after N days, it does not auto-extend, and it does not expire. A queue that acts when nobody
answers is the silent write this repo forbids, and the owner has now said so in his own words.

**What the scheduled job IS allowed to do:** accrue Default Interest per the contract (0.067% daily,
compounded, from day 36), recompute the Repurchase Price, and place or refresh the row in the queue.
Accruing contract interest is arithmetic the agreement obliges; recoursing an invoice is a business
decision. **The job may compute. Only the owner may decide.**

Guard it: one guard that fails the push if any scheduled or background path can set
`recourse_returned`, write a recourse posting, or relieve the Factoring Advance liability without an
owner confirmation and a matched reserve bank line.
