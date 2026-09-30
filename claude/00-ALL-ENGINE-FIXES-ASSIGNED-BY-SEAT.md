# 00-ALL-ENGINE-FIXES — EVERY DEFECT, ASSIGNED, WITH PROOF REQUIRED
# Claude Lead · 09-30-2026 · Owner: *"fix all issues with all engines."*
# Read `00-RECONCILIATION-TIED-OUT-NEVER-REDERIVE-THIS.md` FIRST — it carries the rules, the query traps and every
# number below with its source. Obey `00-SEAT-CONTRACT.md`. **Finish your fix, then resume your sequence.**

## THE SCOREBOARD — what every account must equal when this is done
| Account | Today | Target | Owner |
|---|---|---|---|
| 1090 Undeposited Funds | $315,561.76 | **$0.00** — all funds are deposited | CC-1 + CC-2 |
| 2150 Factoring Advance | $500,374.17 | **$315,356.28** | CC-2 |
| 6300 Bank Svc & Wire Fees | $174,666.12 gross | **≈ $220** (Faro's real wire fees) | CC-2 |
| 1100 Accounts Receivable | $336,809.12 | +$52,960.00 once the 12 post | CC-1 |
| 2000 Accounts Payable | $2,117.49, no bills | **Bills behind it, or $0.00** | CC-1 |
| 1295 Relay Fuel Wallet | **−$32,324.02** | **≥ $0.00** | CC-3 |
| 2510 Dreamline Card Payable | $141,197.23 | ties to the card statement | CC-3 |
| 5000 Fuel & Diesel | $179,550.03 | ties to fuel expense, **$7,259.92 gap** | CC-3 |
| 1000 Bank | $170,194.79 | ties to feed $162,334.55, **$7,860.24 gap** | CC-2 |

---

# CC-2 — FACTORING. Three fixes, one root cause.

## F1 — $174,666.12 of net wire is in a fee expense account, and it inflates the liability by $185,017.89
The funding entry credits **2150** for the full purchase while part of the offsetting debit lands in **6300**
instead of **1090**. It balances, so nothing caught it. Then 48 hand-written journal entries reversed 6300,
leaving a net of $230.00 against Faro's real wire fee of **$220**.

**This is also the "41 entries that skip Undeposited Funds." One defect, one fix, not two.**

- Net wire goes to **1090**. 6300 receives a line **only** when Faro actually charged a wire fee, **only** for
  that amount. No remainder dumping, no zero lines.
- Move the mis-posted amounts from 6300 to 1090, paired with their existing hand reversals so nothing double-counts.
- **Prove: 2150 lands on $315,356.28 exactly. 6300 ≈ $220.**
- **Guard:** 6300 may never receive a factoring posting larger than that advance's recorded wire fee.

## F2 — sweep the rest of 1090 to the bank. All funds are deposited.
The advance sweep exists now (8 rows done, $17,450.00, AUTH-134). Run the remaining **7**, then sweep everything
else in 1090 that has a matching deposit. **Target: 1090 = $0.00.** Anything that will not clear must be named
with its reason — never left sitting.

## F3 — the 28 duplicate funding copies · **$79,857.74**
Survivor per group determined from `~/Downloads/faro daily purchase report.csv` and
`09-25-26-JPM_RECONCILIATION.csv` — the copy matching both the canonical shape and Faro's own figures. Then
**void**, then **delete**, archive-first, children first, reversal deleted with the copy it reverses. Owner has
authorised the delete. **Prove the overstatement falls by exactly $79,857.74 and nothing else moves.**

## F4 — the factoring → invoice foreign key
`accounting.factoring_advances` carries only `faro_invoice_number` text. **Build the real FK to
`accounting.invoices`.** Owner's rule: you cannot factor without an invoice. Report any advance that cannot
satisfy it — do not delete it.

## F5 — the $7,860.24 bank difference
GL 1000 $170,194.79 vs the feed's **$162,334.55** (sum `amount_cents` directly — it is already signed). Itemise it.

---

# CC-1 — EXPENSES, A/P, A/R. Four fixes.

## C1 — the 12 invoices that never posted · $52,960.00
13625 $6,250 · 13616 $5,700 · 13503 $4,900 · 13504 $4,900 · 13621 $4,900 · 13539 $4,860 · 13509 $4,400 ·
13620 $4,300 · 13618 $3,700 · 13533 $3,450 · 13626 $3,400 · 13622 $2,200.
**Five already carry Faro advances — 13618, 13620, 13622, 13625, 13626 ($19,850).** We booked the liability and
the cash and never booked the receivable or the revenue.
**13525 is the $0.00 invoice** — a zero invoice is not an invoice. Resolve it: real amount, or void it.
**13503/13504/13509/13533/13539 are the disputed cross-entity loads — post them, do NOT delete them.** Nobody
deletes a record nobody has verified.

## C2 — the expense engine is creating Accounts Payable
2000 is fed **only** by the expense engine: 100 credits $7,170.68, 85 debits $5,053.19, net **$2,117.49**, and
**zero bills exist.** Owner: *a Bill is Accounts Payable.*
- If it was **paid** → it is an Expense; credit the real funding account (bank, 2510, 1295). **Never 2000.**
- If it is **owed** → create a **Bill**, with vendor, terms and due date, so A/P has a subledger.
- **Guard:** no posting with `source_transaction_type='expense'` may touch account 2000.

## C3 — $108,602.28 of fuel credited to Undeposited Funds
1090 is money coming **in**. Fuel is money going **out**. The 5000 debit is correct; the counter-account is not.
Route each to what actually paid it — **2510 Dreamline**, **1295 Relay**, or **1000 bank** — decided per
transaction from the real funding source, never defaulted. **Do not reverse the 5000 debits. Fuel is a real expense.**
**And do not reverse the $1,506,349.40 of fuel postings** — `verify-fuel-cost-posts-exactly-once` asserts **once**,
not never. Quote its line in your report.
**Guard:** no fuel posting may credit 1090.

## C4 — the 842 expense double-posts, and the $166,868.94 plug
- **842** expenses post twice — once at creation, once at **match**. Matching posts **nothing**. Kill that path,
  then reverse the duplicates NetSuite-style. Never delete.
- **$166,868.94** manual plug against 1090: produce its source — which deposits, which invoices, which wires — or
  report exactly what cannot be sourced. **Owner's rule: no plugs.**
- **9000 Ask My Accountant** — 60 postings each way, **nets to zero**, all proper reversals. **Not money at risk.**
  A routing cleanup only: those 60 should have gone to real accounts the first time. Lower priority than the above.

---

# CC-3 — FUEL CARDS AND DISPATCH. Three fixes.

## D1 — Relay Fuel Wallet is a negative asset · **−$32,324.02**
1295 is a **prepaid wallet**: load it, spend it down, floor of zero. **It cannot be negative.** Either the
top-ups were never recorded, or fuel was charged against it that was actually paid another way.
**Find which, per transaction, from the Relay statements.** Reconcile 1295 to Relay's own balance.
**Guard:** 1295 may not go below zero.

## D2 — Dreamline card payable $141,197.23, and the $7,259.92 fuel gap
Tie 2510 to the Dreamline card statement. Then close the gap between **5000 Fuel & Diesel $179,550.03** and the
fuel expense total **$172,290.11**. Also: **7 fuel expenses carry no linkage** — link them.
**9110 Fuel Inventory On Hand has no postings at all** — the tank-inventory account is unused. Either wire it or
say plainly that weighted-average tank costing is not live, so nobody claims it is.

## D3 — status truth (ROUND 279, unchanged)
13625 and 13626 back to `dispatched`. Find and disable the script that batch-wrote statuses — 46 loads set to
`closed` in one millisecond. **12 USMCA loads carry no `customer_wo_number`**, which makes them impossible to match
to Faro at all. Backfill from the rate confirmations and make W/O required at load creation.

---

# PROOF EVERY SEAT OWES — no exceptions
Before and after for every account you touched. **The Trial Balance must still balance and no account may move
that you did not intend to move.** All 3,651 journal entries balance today — **keep it that way.** Paste the live
query, merge, deploy, paste the deploy id.

**If a proof does not come out clean, stop and say so. Do not proceed. A silent partial is how all of this started.**

---

# AMENDMENT 1 — THE ROOT CAUSE IS CATEGORIZATION. RE-READ THE SCOREBOARD IN THAT LIGHT.
**Owner, 09-30: the funds ARE deposited and in the account — they have not been CATEGORIZED. Verified live:
920 of 927 bank transactions are uncategorized, 0 reconciled, $182,884.55 net.**

**This changes HOW every balance fix is done, not WHAT it must equal.**

> **NO PLUG, NO MANUAL JOURNAL ENTRY, NO ADJUSTMENT may be used to move 1090, 2510 or 1295 to their targets.
> Those accounts land correctly when the 920 bank rows are categorized and matched. Any seat that "fixes" a
> balance with an adjusting entry has broken the owner's no-plugs rule and will be reversed.**

## THIS PROMOTES ROUND 276 TO THE CRITICAL PATH — **CC-1, HIGHEST PRIORITY**
Bulk accept is no longer a convenience. **It is the mechanism that fixes the balance sheet.** 920 rows cannot be
categorized one at a time. The engine proposes, the owner accepts in bulk, **Owner Law B holds — no automatch,
ever.** Ship it, then the categorization can actually happen.

## CC-3 — D1 AND D2 ARE REWRITTEN. THE DEPOSITS ARE NOT MISSING; THEY ARE UNCATEGORIZED.
**Do not create wallet top-up entries or payment entries by hand. They already exist in the bank feed.**

**Dreamline:** 24 bank rows, **all 24 uncategorized**, net **−$168,743.74 actually paid**. The GL records only
**$52,779.99** of payments. **$115,963.75 of real payments were never posted.** Categorize those 24 rows against
**2510**, and 2510 should fall from $141,197.23 to roughly **$25,233.48**. **Then** tie it to the Dreamline
statement — the statement is the proof, not the plug.

**Relay:** 84 rows, **78 uncategorized**. 1295 holds only $2,198.37 of loads against $34,522.39 of spend, which is
why a prepaid asset went negative. Categorize the top-ups against **1295**; the negative balance resolves itself.
**A prepaid wallet cannot be negative — but do not force it positive with an entry.**

## CC-2 — F2 IS REWRITTEN
1090's $315,561.76 is **deposited money the ledger was never told about.** It clears by categorizing and matching
the deposits, then sweeping. **Not by a plug.** The $166,868.94 manual plug already in the books (CC-1's C4) is
exactly the wrong pattern — do not add another.

## THE $7,860.24 BANK DIFFERENCE — RESOLVED IN PRINCIPLE, STILL TO BE ITEMISED
It is a subset of the same 920 uncategorized rows. **It will close as categorization proceeds.** Itemise what
remains **after** the categorization pass, not before — chasing it now measures a moving number.

## PROFORMA — BUILD BOTH DIRECTIONS (owner's rule, 09-30)
**A proforma shows in CASH FLOW, but NOT in the books.** 14 proforma invoices, **$61,375.00**.
- They must **never** post to A/R or revenue. They currently do not. **Do not "fix" that.**
- They **must** appear in the cash-flow forecast as expected inflow. **Verify they do. If they do not, that is a
  defect of equal weight.**

## THE FOUR LOADS WITH NO IDENTIFIER — CC-3
8 of the 12 carry a PO and join to Faro correctly; **Lead's "can never be matched" was wrong and is withdrawn.**
Only these four carry neither W/O nor PO, $14,250.00 total:
- **13582** — recoverable **right now** from `~/Downloads/09-25-26-JPM_RECONCILIATION.csv`: Faro 64,
  PO `SEM66514`, Settlement 5805, S E Mares Forwarding Service LLC.
- **13572, 13578, 13595** — find in the rate confirmations or the settlement PDFs.
**Then make W/O or PO required at load creation.**

# THE RULE THIS AMENDMENT EXISTS TO SET
**When a balance is wrong, find the transaction that was never categorized, matched or posted. Do not write an
entry to make the number look right.** Every defect in this entire audit — the $185,017.89 liability, the
$315,561.76 clearing balance, the $115,963.75 of Dreamline payments, the negative Relay wallet, the $52,960.00 of
unposted invoices — is a **missing or misrouted transaction**, not a missing adjustment. **The ledger mechanics are
sound: all 3,651 journal entries balance and every reversal is a real reversal. Build the engines to record
reality correctly, and the balance sheet fixes itself.**
