# LEAD — 2026-10-02 — THE FARO LIFECYCLE IS APPROVED, WITH THREE CORRECTIONS. BUILD IT.

**YES — I agree with the lifecycle and with the one rule running through it: nothing posts from a
timer or a button. Every journal entry is born from a real money movement matched in Banking or on
Faro's statement. Secured borrowing, so the invoice stays in our A/R the whole time.** That is right
and it is approved.

**Approved as written:** the purchase entry (it balances — Net 10,000 = bank 9,630 + reserve 150 +
factoring fee 200 + wire fee 20, matching the contract's Purchase Price = Net − (Factoring Fee +
Security Reserve) and Purchase Price Proceeds = Purchase Price − Transaction Fees); customer-pays-Faro
relieving both A/R and the advance; reserve release as a Banking transfer being the **only** way
reserve money leaves; days 1–35 free with a per-invoice countdown on screen; the day-95 repurchase-due
event that **alerts and posts nothing**; the move to **1220 Factoring Recoursed Invoices** on
repurchase, which is the account the owner's CPA answer named for chargebacks; and the write-off only
on owner approval.

**And strongly approved: killing the nightly interest posting.** A job that writes journal entries
while everyone is asleep is the silent write this project forbids. Compute daily, show on screen, post
**one accrual at month-end close through the period-close engine with approval**, then true up to
Faro's statement. That is both correct control and correct GAAP.

---

## CORRECTION 1 — THE ONE RESERVE ACCOUNT IS 1230, NOT 1236. THE ACCOUNT WITH HISTORY SURVIVES.

You proposed keeping one reserve and calling it 1236 "Faro Security Reserve." One reserve is right.
**1236 is the wrong survivor.**

- **1230** was created by migration `202607013000` §3g, carries the role **`factor_reserve_held`**, and
  holds the CPA ruling recorded verbatim in that migration: *"due-from-factor; the reserve is OUR
  asset, NOT a liability."* **It has the history and the role binding.**
- **1236** was created yesterday, 09-30, by `202615000000`, whose **own comment documents why**: it
  searched `'%Escrow Reserve%'` and `'%Faro%Escrow%'`, found nothing, and created a second account
  beside the real one. 1230 is named "Factoring Reserves" — it contains neither word, so the search
  could not find it.

**Keeping 1236 means retiring the account that carries the postings and the role and keeping the one
created by a failed search. The account with history survives; the account created by mistake
retires.** 1230 is renamed **"Factor Reserve Holdback"** (ACCT-F9633) precisely so the next person
searching for the factor's holdback cannot miss it again. Retirement of 1235 and 1236 follows the same
rule: **assert first, refuse loudly if either carries a posting, a bank account, a role or a binding**
— a chart-of-accounts row with history is deactivated and hidden, never deleted, and the reference is
repointed.

## CORRECTION 2 — ACCRUED INTEREST GETS ITS OWN LIABILITY. DO NOT CREDIT IT TO 2150.

You have the month-end accrual as DR 6830 / **CR 2150**. That conflates principal with accrued
interest, and it costs us the single most useful control in the whole module.

The contract: **Repurchase Price = Net Amount + unpaid Transaction Fees + Default Interest − credits.**
Interest is a separate component. If 2150 carries both, **2150 can never be reconciled to the Net
Amount of open Purchased Accounts** — and that reconciliation is the one-line proof that the subledger
and the GL agree.

**Build it as:**
- Month-end accrual: **DR 6830 Default Interest / CR 2155 Accrued Factoring Interest.**
- **2150 Factoring Advance always equals the sum of the Net Amounts of open Purchased Accounts.** One
  query, and a guard that fails the build if it ever doesn't.
- Repurchase paid: **DR 2150** for the Net Amount, **DR 2155** for the accrued interest, **DR expense**
  for any *new* fee Faro charges at that moment; **CR** the bank, or the reserve if Faro took it from
  there, or the netting line on the next funding. **Not "DR 2150 for the full repurchase price"** —
  that over-relieves 2150 by the interest.
- Fees already paid at purchase are not "unpaid Transaction Fees" and are never booked twice.

## CORRECTION 3 — 1235: **MERGE IT.** HERE IS THE PROOF, FROM FARO'S OWN STATEMENT.

You asked for my call, and it is not a judgement call — Faro answers it:

```
FARO ACCOUNT SUMMARY.csv  — Faro's statement of record, the balance we reconcile to:
    "AR Balance","0.00","329631.72"
    "Escrow Reserve","0.00","5053.24"        <-- ONE reserve line. There is no "Cash Reserve" line.

FARO PURCHASE REPORT-09-25-26.csv — the per-transaction detail:
    Debtor,Date,Inv #,PO,Other Ref,Purchase,Escrow Rsv,Cash Rsv,Discount,Fees,Dispatch,Net Adv,...
                                                        ^^^^^^^^^^  ^^^^^^^  two COLUMNS
```

**Two columns on the per-purchase detail. ONE balance on the account summary — $5,053.24.** Faro does
not hold two pools; it reports one reserve two ways. The contract agrees: it names exactly one reserve,
the **Security Reserve, 1.5% of the Net Amount**, and "cash reserve" appears nowhere in it.

**RULING: one GL account — 1230 Factor Reserve Holdback. 1235 and 1236 both retire into it. Faro's two
columns become `faro_bucket: escrow | cash` on the reserve-ledger row**, carried so the per-transaction
detail still ties to the statement line by line. **A presentation split on a statement is never a
second GL account** — that is the entire lesson of this week, and it is why Factoring and Banking
disagreed by construction.

This also closes the escrow confusion for good: **"Escrow Reserve" is Faro's label on its own
statement.** It does not make the factor's holdback driver escrow. The owner's CPA answers are
explicit — *"escrow is a current liability"*, *"factoring is an asset"*, *"driver escrow has nothing to
do with faro."* So the **GL account carries the contract term (Security Reserve / Factor Reserve
Holdback) and Faro's label is carried only as a statement-mapping string for tie-out.** The word
"escrow" never appears on a factoring account, role, column, label or tab. Driver escrow stays in the
2100 series with no Faro role, no Faro bank account and no factoring posting, ever.

## ONE ADDITION — THE FEE TAXONOMY IS THREE THINGS, NOT ONE

Faro's statement separates them and so must we, or the fee tie-out never closes:

```
"Discount Fee","5366.37"     -> the contract's FACTORING FEE
"Schedule Fee","44.38"       -> a TRANSACTION FEE
"Wire Fee","260.00"          -> a TRANSACTION FEE
"Payments to You *","341899.39"   "Debtor Receipts","28125.00"
"Total Change in NFE","319445.14" "Ending Balance","319445.14"
```

Map each to its own item and GL account, and build the statement tie-out to those five totals plus the
AR Balance and the one reserve balance. **The contract distinguishes the Factoring Fee (a component of
the Purchase Price) from Transaction Fees (deducted from the Purchase Price to give Proceeds, and
recoverable in the Repurchase Price when unpaid). One "fees" bucket loses that distinction and the
Repurchase Price can then never be computed correctly.**

---

## YOUR FOUR ACTIONS — ALL FOUR APPROVED, IN THIS ORDER

1. Correct the order on the bus and my premise. **Do it — and my own ruling that recourse should "DR
   A/R back from the customer" is void; A/R never left under secured borrowing.**
2. Retarget the uncommitted recourse-event table to a **repurchase** event: invoice, customer, purchase
   date, deadline (95 calendar days default, **overridable by an accelerated deadline with its notice
   date**), repurchase price components held separately — net, unpaid transaction fees, accrued
   interest, credits.
3. Build the factoring-side posters that Banking's match engine calls. **Posters only — they never
   decide, they post what a matched movement says.** Cursor's match engine calls them; you expose them.
4. Stop the nightly interest posting and move it to the period-close accrual. **Reverse anything that
   job already posted through the void/reversal engine — never a delete.**

Also still owed, from the contract and unbuilt: **misdirected payment forwarded to Faro within 1
business day** (a breach here triggers the acceleration clause), our **2-business-day cancel right**
with the exact amount and expiry on screen, and **accelerated deadlines after 5 business days' written
notice** carried per Purchased Account.

**Every factoring constant lives in the contract-terms table with its citation — 30, 5, 0.067%, 1.5%,
95 calendar, 5 business, 2 business, 1 business — and no engine hard-codes a number that is not in that
table.** That rule is what would have caught the day-95 deduction before it was built.

Nothing posts from a timer or a button. Nobody seeds, feeds, matches or categorizes. Build only, 100%
per seat, no handoffs. The owner verifies in Chrome when every build is complete. **Resume.**
