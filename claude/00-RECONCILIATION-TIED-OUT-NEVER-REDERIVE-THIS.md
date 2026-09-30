# 00-RECONCILIATION — TIED OUT TO SOURCE — NEVER RE-DERIVE THIS
# Claude Lead · 09-30-2026 · Every figure below is tied to a named source file or a live query.
# **This file exists so no seat, and no future Lead, ever measures these again from scratch or guesses them.**

## THE SOURCES OF TRUTH — named, located, authoritative
| Question | Authoritative source |
|---|---|
| What Faro purchased, and for how much | `~/Downloads/faro daily purchase report.csv` |
| Faro's reserve balances | `~/Downloads/FARO ACCOUNT SUMMARY.csv` |
| What Faro paid us and when | `~/Downloads/FARO-PAYMENTS TO YOU REPORT.csv` |
| Faro aging | `~/Downloads/FARO AGING REPORT.csv` (also BY FUND DATE / BY INVOICE DATE) |
| Faro fees | `~/Downloads/FARO ALL FEES.csv`, `FARO FEES PAID.csv` |
| Which loads are currently moving | the owner's live AlwaysTrack board |
| Which loads are finished | the company and driver settlement PDFs |
| What posted | `accounting.journal_entry_postings` (live) |

**Faro keys on ITS OWN invoice number (`094`, `097`, …), never on our load number.** Grepping a Faro file for a
load number returns nothing and means nothing. Join through `accounting.factoring_advances.faro_invoice_number`.
*(Lead made exactly this mistake on 09-30 and nearly reported "not in Faro" from a bad grep.)*

---

# TIE-OUT 1 — THE SIX FARO INVOICES (register item 1, CC-1 blocked on these for days)
CC-1 refused to add these to `scripts/feed/day_control.json` because it would not fabricate the dollar figures.
**It was right to refuse. The figures were never missing — they are in Faro's own report.**

Source: `faro daily purchase report.csv`. Columns as Faro names them.

| Faro Inv | Load | Debtor | Date | Purchase | Escrow Rsv | Cash Rsv | Discount | Fees | Net Adv | Sch Fee |
|---|---|---|---|---|---|---|---|---|---|---|
| 094 | 13622 | TTS LLC | 09/24/2026 | 2,200.00 | 33.00 | 0.00 | 33.00 | 0.00 | **2,134.00** | 0.00 |
| 096 | **NOT IN OUR SYSTEM** | GREATWIDE TRUCKLOAD MANAGEMENT | 09/24/2026 | 4,019.72 | 60.30 | 0.00 | 60.30 | 0.00 | **3,899.12** | 0.00 |
| 097 | 13618 | Refrigerx Transportation LLC | 09/24/2026 | 3,700.00 | 55.50 | 0.00 | 55.50 | 0.00 | **3,589.00** | 0.00 |
| 101 | 13620 | Bennett International Logistics | 09/25/2026 | 4,300.00 | 64.50 | 0.00 | 64.50 | 10.00 | **4,161.00** | 0.00 |
| 103 | 13625 | LOGIMAX TRANSPORT INC | 09/25/2026 | 6,250.00 | 93.75 | 0.00 | 93.75 | 0.00 | **6,062.50** | 0.00 |
| 104 | 13626 | FLS Transport Inc. | 09/25/2026 | 3,400.00 | 51.00 | 0.00 | 51.00 | 0.00 | **3,298.00** | 0.00 |

**Five of six tie to our `accounting.factoring_advances` EXACTLY — both face and net advance, to the cent.**
The debtors also match the owner's AlwaysTrack board independently (13625 → LOGIMAX, 13626 → FLS). **Three
independent sources agree.**

**FARO 096 IS RESOLVED — it is LOAD 13617.** PO `G4468456`, status `invoiced`, in USMCA the whole time. It was
never missing; it was never *linked* to its advance. Lead's earlier "no record of it" was wrong and is withdrawn.

## THE JOIN KEY NOBODY HAD WRITTEN DOWN — THIS IS THE WHOLE TRICK
**Faro's `PO` column IS the AlwaysTrack W/O number**, which is our `mdata.loads.customer_po_number` or
`customer_wo_number`. Faro's `Inv #` is Faro's own sequence and means nothing to us. Match on **PO**, and allow
for leading zeros dropped (`005804613` on the board is `5804613` in Faro) and punctuation differences.

**The complete mapping — all six, tied to Faro's own figures, nothing invented:**

| Faro Inv | PO / W-O | Load | Debtor | Date | Purchase | Escrow Rsv | Discount | Fees | **Net Adv** |
|---|---|---|---|---|---|---|---|---|---|
| 094 | 16471804 | 13622 | TTS LLC | 09/24/26 | 2,200.00 | 33.00 | 33.00 | 0.00 | **2,134.00** |
| 096 | G4468456 | **13617** | GREATWIDE TRUCKLOAD MGMT | 09/24/26 | 4,019.72 | 60.30 | 60.30 | 0.00 | **3,899.12** |
| 097 | 1013809 | 13618 | Refrigerx Transportation | 09/24/26 | 3,700.00 | 55.50 | 55.50 | 0.00 | **3,589.00** |
| 101 | 1777319 | 13620 | Bennett International | 09/25/26 | 4,300.00 | 64.50 | 64.50 | 10.00 | **4,161.00** |
| 103 | LGMX142 | 13625 | LOGIMAX TRANSPORT | 09/25/26 | 6,250.00 | 93.75 | 93.75 | 0.00 | **6,062.50** |
| 104 | 5804613 | 13626 | FLS Transport | 09/25/26 | 3,400.00 | 51.00 | 51.00 | 0.00 | **3,298.00** |

**REGISTER ITEM 1 IS UNBLOCKED.** CC-1 refused for days to add these to `scripts/feed/day_control.json` because it
would not fabricate the dollar figures. **It was right, and nothing needs inventing — every figure above is read
straight out of the owner's own Faro files.** Cash Rsv is 0.00 and Sch Fee is 0.00 on all six.

## THE OWNER'S MASTER RECONCILIATION FILE — USE IT, DO NOT REBUILD IT
`~/Downloads/09-25-26-JPM_RECONCILIATION.csv` already maps **Faro Inv # → PO → LOAD → Settlement** for invoices
1 through 104. It is the owner's own working file and it is authoritative for that mapping. Rows 94-104 have the
LOAD and Settlement columns blank — **those are the ones that were never linked, and the table above fills them.**

Two data-quality notes in that file, so nobody trips on them:
- The last row has `Inv #` and `PO` **transposed** (`Inv #=1013272-2`, `PO=59`).
- Rows marked `NOT PURCHASED` (Faro 9, 10, 26, and 2 EMS / load 13555) are real rows Faro did not buy. They are
  not errors and must not be deleted.

# TIE-OUT 2 — 13 SENT INVOICES THAT NEVER POSTED TO THE GL
Live, USMCA, unvoided, `status='sent'`, no posting with `source_transaction_type='invoice'`:

| Load | Amount | Factoring | Note |
|---|---|---|---|
| 13525 | **$0.00** | not factored | the $0.00 invoice, register item 10 |
| 13618 | 3,700.00 | **ADVANCE TAKEN** | Faro 097 |
| 13620 | 4,300.00 | **ADVANCE TAKEN** | Faro 101 |
| 13622 | 2,200.00 | **ADVANCE TAKEN** | Faro 094 |
| 13625 | 6,250.00 | **ADVANCE TAKEN** | Faro 103 |
| 13626 | 3,400.00 | **ADVANCE TAKEN** | Faro 104 |
| 13503 | 4,900.00 | not factored | one of the 5 disputed cross-entity loads |
| 13504 | 4,900.00 | not factored | one of the 5 |
| 13509 | 4,400.00 | not factored | one of the 5 |
| 13533 | 3,450.00 | not factored | one of the 5 |
| 13539 | 4,860.00 | not factored | one of the 5 |
| 13616 | 5,700.00 | not factored | |
| 13621 | 4,900.00 | not factored | |

**The five with advances total $19,850.** Faro bought those invoices and wired the money. Our system recorded the
**liability to Faro** and the **cash in**, and never recorded the **receivable** or the **revenue**.
**We are carrying a liability and cash with no receivable behind it.** This is the owner's rule —
*you cannot factor without an invoice* — broken literally.

**The five disputed cross-entity loads (13503, 13504, 13509, 13533, 13539) all carry USMCA invoices, sent,
unposted, not factored.** They are now identifiable by name. **Nobody deletes them until the owner rules.**

# TIE-OUT 3 — A/R DOES NOT TIE, AND HERE IS THE ARITHMETIC
```
A/R per open invoices, excluding proforma ...... $396,051.72
A/R per the GL, account 1100 ................... $336,809.12
gap ............................................  $59,242.60
   explained by the 13 unposted sent invoices ..  $52,960.00
   STILL UNEXPLAINED ...........................   $6,282.60   <- OPEN
```
Two invoices sit in `partial` status totalling $6,620.00 — **close but not equal, so it is not the answer.**
**Do not call this reconciled until the $6,282.60 is named.**

**Proforma is correct to be unposted.** 14 proforma invoices, $61,375.00, carry no GL posting and must not — a
proforma is not a receivable. Never "fix" these.

# TIE-OUT 4 — WHAT IS PROVEN CORRECT (do not rewrite these engines)
- **All 3,651 journal entries balance.** Zero unbalanced, zero cents of imbalance.
- **Every expense-account credit sits inside a journal entry carrying `reverses_je_id`.** 641 fuel, 73 tolls,
  60 suspense, 25 washout, 18 lumper, 8 tires, 8 repairs, 8 parts, 1 office — **zero unexplained.** The engine
  reverses; it does not net. The NetSuite void mechanics work.
- **Revenue recognition is textbook**: load posts DR 1150 Unbilled Revenue / CR 4000 Freight Income
  ($440,266.00, 125 postings); the invoice then posts DR 1100 A/R / CR 1150.
- **Customer payments**: DR 1090 / CR 1100. **Driver settlements**: DR 6890 Cost of Labor–Mexico Drivers,
  CR 2170 Driver Net-Pay Clearing and the per-driver escrow liabilities. **Default interest**: DR 6830 / CR 2150
  across all 194 postings.
- **`1235 Faro Cash Reserve` holds $135.41**, tying to Faro's cash reserve less the $4,000 deposit. **It is real.
  The question of deleting it is CLOSED — it stays.**

# TIE-OUT 5 — CORRECTED FINDINGS (Lead overstated these; do not act on the original wording)
- **`9000 Ask My Accountant` is NOT money sitting in suspense.** All 60 credits are proper reversals; the account
  nets to zero. It is a routing question — those 60 expenses should have gone to real accounts the first time —
  **not money at risk.**
- **Fuel must post.** `verify-fuel-cost-posts-exactly-once` asserts **once**, not never. **The $1,506,349.40 of
  fuel postings is NOT to be reversed.** The defect is the 48 excess pairs and the $7,259.92 gap on 5000.
- **The "41 entries that skip Undeposited Funds" and the "$174,666.12 in 6300" are ONE defect, not two.** The
  money went to 6300 instead of 1090.

# THE RULE THIS FILE EXISTS TO ENFORCE
**Every number in any report, guard or instruction must name the source it came from.** A figure with no named
source is not evidence and may not be acted on. When two sources disagree, resolve which is authoritative and
write the answer here — never average them, never take the convenient one, never re-derive from scratch what is
already tied out above.

---

# TIE-OUT 6 — CONTROL ACCOUNT BREAKS · measured live 09-30-2026, USMCA, unvoided

| Account | GL balance | Subledger | Difference | Verdict |
|---|---|---|---|---|
| **2150 Factoring Advance** (liability) | **$500,374.17** | **$315,356.28** | **$185,017.89 OVERSTATED** | **DEFECT** |
| **1090 Undeposited Funds** (clearing) | **$315,561.76** | should be ≈ $0 | — | **DEFECT** |
| **1100 Accounts Receivable** | $336,809.12 | $396,051.72 | $59,242.60 understated | **DEFECT** |
| **2000 Accounts Payable** | $2,117.49 credit | $0.00 open bills | $2,117.49 | **DEFECT (small)** |
| 1230 Factoring Reserves | $7,356.68 | — | — | check vs Faro ACCOUNT SUMMARY |
| 1150 Unbilled Revenue | $94,369.00 | — | — | should equal delivered-not-invoiced |
| 1000 Bank of America | $170,194.79 | feed nets **$162,334.55** | **$7,860.24** | **DEFECT (small) — corrected below** |

## 2150 — YOU APPEAR TO OWE FARO $185,017.89 MORE THAN YOU DO
The books carry a **$500,374.17** liability to Faro; actual outstanding advances are **$315,356.28**.

**Almost certainly the same root cause as the $174,666.12 sitting in 6300.** The funding entry credits 2150 for
the full purchase while part of the offsetting debit lands in **6300 Bank Service Charges & Wire Fees** instead of
**1090 Undeposited Funds**. The entry balances, so nothing caught it — but the liability is inflated.
**This is a balance-sheet overstatement of company debt.** Fixing DEFECT 1 should move this; **prove that it does,
and that 2150 lands on $315,356.28.**

## 1090 — $315,561.76 PARKED IN A CLEARING ACCOUNT
A clearing account should empty out. Known contributors, both already assigned:
- **$108,602.28** of fuel wrongly credited here (DEFECT 2 — fuel is money OUT, 1090 is money IN).
- Factoring advances that were bank-matched but never swept (the $39,108; 8 rows done, 7 remain).
- The **$166,868.94** manual plug (DEFECT 4) moved money out of here by hand rather than by a sweep.
**Target: 1090 approaches zero. Any residual must be named, not left.**

## 2000 — A/P WITH NOTHING BEHIND IT
GL carries **$2,117.49** credit; **zero** open bills support it. Small, but a control account with no subledger is
wrong. Find the entries and either produce the bills or reverse them.

## 1000 BANK — LEAD'S OWN ERROR, CAUGHT AND CORRECTED. READ THIS BEFORE TOUCHING BANK MATH.
Lead first reported a **$646,999.10** bank gap. **That was wrong and it was Lead's arithmetic, not the books.**

**`banking.bank_transactions.amount_cents` IS ALREADY SIGNED.** Withdrawals are stored **negative**. Lead applied
`CASE WHEN is_credit THEN amount ELSE -amount END`, which negated the withdrawals a second time and inflated the
total by roughly double the outflow.

```
is_credit = true    88 rows   +$489,764.22   (money IN)
is_credit = false  839 rows   -$327,429.67   (money OUT, ALREADY NEGATIVE)
correct net        sum(amount_cents) = $162,334.55
GL account 1000                       $170,194.79
REAL difference                         $7,860.24
```

**Never write `CASE WHEN is_credit THEN amount ELSE -amount END` against this table. Just sum `amount_cents`.**

Sign convention confirmed against real rows: `WIRE TYPE:WIRE IN … ORIG:FARO FACTORING LLC` at $32,097.00 (09/11),
$27,773.98 (09/21), $27,441.00 (09/18), $24,347.74 (09/28), $21,836.90 (09/14), $21,083.00 (08/28) — all
`is_credit = true`, all positive.

**The $7,860.24 is a real reconciliation item** and is small enough to be found by inspection.

**Side confirmation:** the $27,441.00 Faro wire of 09/18 is the same combined wire CC-2 flagged when invoice 84's
net advance was only $3,589 — **one wire covering several invoices. Confirmed independently. A bank line larger
than any single invoice is normal for Faro and must never be flagged as a data error.**

## THE 12 LOADS THAT WILL BREAK THE FARO JOIN
**12 USMCA loads carry no `customer_wo_number` at all.** Faro's PO ↔ our W/O is the only reliable join between our
book and Faro. A load with no W/O cannot be matched to a Faro purchase and will silently fall out of every
reconciliation. **Backfill them from the rate confirmations, and make W/O required at load creation.**

# ORDER OF PROOF WHEN THESE ARE FIXED — every one, before anyone says done
1. 2150 = **$315,356.28** exactly.
2. 1090 ≈ **$0**, with any residual named.
3. 1100 = open invoices excluding proforma, exactly. Currently **$59,242.60** apart, of which **$52,960.00** is the
   13 unposted sent invoices and **$6,282.60 is still unexplained and may not be called reconciled.**
4. 2000 = open bills, exactly.
5. 6300 ≈ Faro's real wire fees only (**$220** per `FARO ACCOUNT SUMMARY.csv`), not $174,666.12.
6. Trial Balance still balances and **no account moved that was not supposed to.**

---

# TIE-OUT 7 — A/R IS FULLY RECONCILED. THE $6,282.60 WAS LEAD'S ERROR.
**There is no unexplained A/R gap. Stop looking for one.**

Every invoice that posted, posted the **exact** right amount to 1100 — checked invoice by invoice against its own
total, zero partial mismatches. The only rows that differ carry **$0.00** in the GL.

```
Open invoices at face (sent + partial, excluding proforma) ..... $396,051.72
  less payments already received on the two partial invoices ...   -$6,282.60
  less the 12 invoices that never posted .......................  -$52,960.00
                                                                  ------------
A/R per the GL, account 1100 ................................... $336,809.12   TIES EXACTLY
```

**The two partial invoices — this is the whole of the "unexplained" $6,282.60:**

| Load | Face | Paid | Remaining |
|---|---|---|---|
| 13521 | 3,500.00 | 3,250.00 | 250.00 |
| 13540 | 3,120.00 | 3,032.60 | 87.40 |
| | | **6,282.60** | **337.40** |

**Lead's error:** counted partial invoices at face value instead of their remaining balance. **When tying A/R,
use `total_cents - amount_paid_cents` for partially-paid invoices, never `total_cents`.**

## THE ONLY REAL A/R DEFECT — $52,960.00, twelve invoices, none posted
13625 $6,250 · 13616 $5,700 · 13503 $4,900 · 13504 $4,900 · 13621 $4,900 · 13539 $4,860 · 13509 $4,400 ·
13620 $4,300 · 13618 $3,700 · 13533 $3,450 · 13626 $3,400 · 13622 $2,200
(13525 is the $0.00 invoice — unposted but contributes nothing.)
**Five of these carry Faro advances: 13618, 13620, 13622, 13625, 13626 — $19,850.**

# TIE-OUT 8 — A/P: THE EXPENSE ENGINE IS CREATING ACCOUNTS PAYABLE
Account **2000** has exactly one source, and it is the wrong one:

```
expense engine -> 2000 A/P   CREDIT  100 postings   $7,170.68
expense engine -> 2000 A/P   DEBIT    85 postings   $5,053.19
                                      net credit    $2,117.49
```

**Zero bills exist to support any of it.** That is not a missing-subledger problem — it is a definitional one:

- An **Expense** is money **already paid**. It credits cash, the bank, or the card. **It must never create A/P.**
- A **Bill** creates A/P, **and creates a bill record** that supports the balance.

The expense engine is doing a Bill's job without producing a Bill. **$2,117.49 is sitting in payable with nothing
documenting who it is owed to.**

**Fix:** decide per transaction. If it was paid, credit the real funding account. If it is owed, create a **Bill**
so A/P has a subledger. **Guard: no posting with `source_transaction_type = 'expense'` may touch account 2000.**

# TIE-OUT 9 — THE FULL CONTROL PICTURE, RESOLVED
| Account | GL | Subledger | Difference | Verdict |
|---|---|---|---|---|
| 1100 A/R | $336,809.12 | $336,809.12 | **$0.00** | **RECONCILED** |
| 1000 Bank | $170,194.79 | $162,334.55 | $7,860.24 | real, small, not itemised |
| 2000 A/P | $2,117.49 | $0.00 | $2,117.49 | **DEFECT — expense engine posting to A/P** |
| 2150 Factoring | $500,374.17 | $315,356.28 | **$185,017.89** | **DEFECT — overstated liability** |
| 1090 Undeposited | $315,561.76 | ≈ $0 expected | — | **DEFECT — clearing account not clearing** |

**Two of the five are now closed.** What remains is the factoring liability, the clearing account, the A/P
routing, the $7,860.24 bank difference, and the $52,960.00 of unposted invoices.

---

# TIE-OUT 10 — THE FUEL ACCOUNTS · measured live 09-30-2026

| Account | Type | Balance | Verdict |
|---|---|---|---|
| **1295 Relay Fuel Wallet** | **Asset** | **−$32,324.02** | **DEFECT — an asset cannot be negative** |
| 2510 Dreamline Diesel Card Payable | Liability | $141,197.23 owed | tie to the card statement |
| 5000 Fuel & Diesel | COGS | $179,550.03 | vs fuel expense total $172,290.11 → **$7,259.92 gap** |
| 9110 Fuel Inventory On Hand | Statistical | **no postings at all** | the tank-inventory account is unused |

**1295 is a prepaid wallet. You load money onto it, then spend it down. It can reach zero. It cannot go
negative.** A credit balance of $32,324.02 means either the wallet top-ups were never recorded, or fuel was
charged against the wallet that was actually paid by another method. **Find which, per transaction.**

# THE OWNER'S STANDING RULES — these govern every engine, permanently

1. **ALL FUNDS HAVE BEEN DEPOSITED.** Owner-stated, 09-30-2026. Therefore **1090 Undeposited Funds must be
   ZERO.** Every cent of the **$315,561.76** sitting there is money that reached the bank and was never swept, or
   money that should never have been routed through 1090 at all. **A non-zero 1090 is a defect by definition.**
2. **A BILL IS ACCOUNTS PAYABLE.** Owner-stated. If account 2000 carries a balance, a Bill must exist behind it
   with a vendor, terms and a due date. **A/P with no Bill is not A/P, it is a number.** An **Expense** is money
   already paid and credits the real funding account — cash, bank, or the card. **It never touches 2000.**
3. **NO PLUGS.** No suspense, no balancing entry, no manual journal entry without a linked source document.
4. **YOU CANNOT FACTOR WITHOUT AN INVOICE.** An advance requires a posted invoice behind it. Enforced by a real
   foreign key, not by convention.
5. **A DOCUMENT POSTS WHEN RECORDED**, dated the transaction date. **Matched/Cleared and Reconciled post nothing.**
6. **ONE NUMBER, ONE SOURCE, NAMED.** A figure with no named source is not evidence.

# THE QUERY RULES — every one of these cost Lead a wrong answer tonight
- **Faro ↔ our loads joins on Faro's `PO` = our `customer_po_number` / `customer_wo_number`.** Never on Faro's
  `Inv #`, never by grepping a Faro file for a load number. Allow for dropped leading zeros (`005804613` ≡ `5804613`).
- **`banking.bank_transactions.amount_cents` is ALREADY SIGNED.** Withdrawals are negative. **Just sum it.** Never
  write `CASE WHEN is_credit THEN amount ELSE -amount END` — that double-negates and inflates the total.
- **A/R tie-outs use `total_cents − amount_paid_cents`** for partially paid invoices, never face value.
- **Proforma invoices must NOT post to A/R.** 14 of them, $61,375.00, correctly carry no posting. Never "fix" these.
- **A Faro wire commonly covers several invoices.** A bank line larger than any single invoice is **normal** and
  must never be flagged as a data error. Confirmed: the $27,441.00 wire of 09/18 against invoice 84's net of $3,589.
- **Rows marked `NOT PURCHASED` in the owner's reconciliation CSV are real.** Faro chose not to buy them. Not errors.
- **`accounting.invoices` has no `invoice_number` column**, and `factoring_advances` has no `invoice_id`. Join
  advances to invoices through `accounting.invoices.factoring_advance_id`.

---

# TIE-OUT 11 — **THE ROOT CAUSE OF EVERY CONTROL BREAK** · measured live 09-30-2026
Owner, 09-30: *"they are deposited, they are in the account, they just have not been categorized."* **Confirmed.**

```
banking.bank_transactions, USMCA, unvoided:
  total rows ................. 927
  UNCATEGORIZED .............. 920   (99.2%)   net $182,884.55
  reconciled ................. 0
```

**920 of 927 bank transactions have never been categorized. Zero have been reconciled.** The money is in the
bank. The ledger was never told what any of it was for. **Every control break below is a symptom of this one fact
— not of missing money, and not of a broken ledger.**

| Symptom | Real cause |
|---|---|
| 1090 holds $315,561.76 | deposited money the ledger was never told about |
| 2510 Dreamline reads $141,197.23 owed | **$115,963.75 of real payments uncategorized** |
| 1295 Relay is −$32,324.02 | 78 of 84 Relay rows uncategorized — the top-ups never posted |
| the $7,860.24 bank difference | a subset of the same 920 |

## DREAMLINE — YOU APPEAR TO OWE $115,963.75 MORE THAN YOU DO
```
Bank feed, DREAMLINE:   24 rows   net -$168,743.74 actually PAID   ALL 24 uncategorized
GL 2510 debits (payments recorded):        $52,779.99
DIFFERENCE — real payments never posted:  $115,963.75
2510 today $141,197.23 owed  ->  real exposure ≈ $25,233.48
```

## RELAY — THE WALLET TOP-UPS ARE IN THE BANK, NOT IN THE LEDGER
84 Relay bank rows, **78 uncategorized**. 1295 shows only $2,198.37 of loads against $34,522.39 of spend, which is
why a prepaid asset went negative. **The deposits into Relay are missing from the books, exactly as the owner
said. They are not missing from the bank.**

## THEREFORE — THE FIX IS CATEGORIZATION, NOT SWEEPS AND NOT PLUGS
No plug, no manual journal entry, no "adjustment" may be used to move 1090, 2510 or 1295 to their right balances.
**Those accounts land correctly when the 920 bank rows are categorized and matched.** This is precisely what
ROUND 276 bulk accept exists to make possible: **the engine proposes, the owner accepts in bulk, Owner Law B
holds.**

# TIE-OUT 12 — PROFORMA: CASH FLOW YES, BOOKS NO
Owner's rule, 09-30: **a proforma shows in cash flow, but not in the books.**
14 proforma invoices, **$61,375.00**. They must **NOT** post to A/R or revenue — and they **MUST** appear in the
cash-flow forecast as expected inflow. **A proforma missing from cash flow is as wrong as a proforma posted to
A/R.** Verify both directions.

# TIE-OUT 13 — THE LOADS WITH NO W/O NUMBER — LEAD'S WARNING CORRECTED
Lead earlier wrote that 12 loads "can never be matched to Faro." **That was overstated. Withdrawn.**

**8 of the 12 carry a PO number, and the PO is the Faro join key** — so they match fine:
13609 `2245258` · 13616 `66607` · **13617 `G4468456` FACTORED** · **13618 `1013809` FACTORED** ·
**13620 `1777319` FACTORED** · 13621 `56709` · **13622 `16471804` FACTORED** · 13623 `568871` (cancelled)

**Only 4 loads carry neither W/O nor PO** — all invoiced and sent, **$14,250.00** total:
| Load | Invoice | In the owner's reconciliation CSV? |
|---|---|---|
| 13572 | $3,200.00 | not found |
| 13578 | $4,650.00 | not found |
| **13582** | $4,900.00 | **YES — Faro 64, PO `SEM66514`, Settlement 5805, S E Mares Forwarding** |
| 13595 | $1,500.00 | not found |

**13582's PO is recoverable from `~/Downloads/09-25-26-JPM_RECONCILIATION.csv` right now.** The other three must
be found in the rate confirmations or the settlements. **Make W/O or PO required at load creation so this stops.**

---

# TIE-OUT 14 — THE INVOICE NUMBERING CONVENTION, AND TWO SOURCE CONFLICTS
Your QuickBooks invoice list numbers invoices **`<Faro invoice #>-<load #>`** — `055-13555`, `059-13577`,
`067-13582`. **That is a third join key** alongside Faro's PO. Source:
`~/Downloads/USMCA Freight Solutions, Inc._Invoice List by Date.csv`, 26 invoices numbered this way.

## CONFLICT 1 — FARO NUMBER 059 IS USED TWICE
`059-13577` **and** `059-13578`. One Faro invoice number, two loads. **One of them is mis-numbered.**
The reconciliation CSV assigns Faro 59 to **13577** (ARMSTRONG, PO `4619442-1`). So **13578's number is wrong in
QuickBooks.** 13578's real row is the transposed one at the bottom of the CSV — Refrigerx, PO `1013272-2`,
purchase **$5,210.00**, net advance **$5,053.70**.

## CONFLICT 2 — 13581 AND 13582 ARE SWAPPED BETWEEN SOURCES
| Source | 13581 | 13582 |
|---|---|---|
| `09-25-26-JPM_RECONCILIATION.csv` | Faro **67**, PO `SMX14610` | Faro **64**, PO `SEM66514` |
| QuickBooks invoice list | Faro **64** (`064-13581`) | Faro **67** (`067-13582`) |

**Directly contradictory. Resolve against Faro's own purchase report by PO — the PO is the debtor's reference and
neither of ours. Do not average, do not guess, do not pick the convenient one.**

## CONFLICT 3 — 13578 AMOUNT DISAGREES BY $560.00
QuickBooks **$5,210.00** · Faro purchase **$5,210.00** · **our invoice $4,650.00**.
**Two independent external sources agree with each other and disagree with us. We are wrong by $560.00.**

# TIE-OUT 15 — THE THREE UNIDENTIFIED LOADS, RESOLVED AS FAR AS THE EVIDENCE GOES
"No identifier" means **no customer PO number and no customer W/O number** — the broker's own reference, which is
what Faro matches on. Without one we cannot join the load to a Faro purchase. It does **not** mean the load is
unknown.

| Load | Invoice | What the sources say |
|---|---|---|
| **13572** | $3,200.00 | **REAL AND SETTLED.** Signed settlement **doc 5798**, driver **Genaro Guerrero Chavez**, loaded pay 1,079.7 mi @ $0.45 = $485.87, escrow −$25. Source: `_repo-push/docs/reconciliation/2026-09-07-usmca/usmca-settlement-lines-from-signed-docs.csv`. **Driver-settled, never customer-referenced.** |
| **13578** | $4,650.00 | **IDENTIFIED.** Faro PO `1013272-2`, Refrigerx Transportation, **$5,210.00** — see Conflict 1 and 3. |
| **13595** | $1,500.00 | **NOT FOUND** in any current source. Appears only in files marked `STALE-DO-NOT-USE`. **Still open.** |

**So: 13572 is settled and real. 13578 is identified and our amount is wrong. Only 13595 is genuinely unresolved.**

# THE OWNER'S CATEGORIZATION RULE — 09-30-2026
> **"We only categorize those that are identical. 100%."**

Bulk accept may pre-tick **only** exact matches — amount, date and payee all identical. **Anything less than 100%
comes up unticked for the owner to decide.** This is not a confidence threshold to tune; it is a hard rule.
Combined with Owner Law B (never automatch), the engine proposes, the owner accepts, and only perfect matches are
ever proposed as ticked.

# THE NO-PLUG RULE — AN HONEST NOTE ON WHERE IT COMES FROM
**QuickBooks and NetSuite do NOT forbid plugs.** Both allow journal entries and adjustments freely; QuickBooks
ships **Ask My Accountant** as a suspense account, which is why account 9000 exists here. What both *recommend* is
categorizing the real transaction rather than adjusting to a number.

**The owner's no-plug rule is stricter than either product.** It is a deliberate choice to hold a higher bar than
the industry standard, not a restatement of one. **Follow it — and do not cite QuickBooks or NetSuite as the
authority for it, because they are not.**

---

# TIE-OUT 16 — **8 DELIVERED LOADS WERE NEVER INVOICED** · measured live 09-30-2026
```
status = completed_docs_received, NO INVOICE:
13497 · 13502 · 13505 · 13506 · 13507 · 13522 · 13530 · 13531
```
**Delivered, documents received, never billed.** Revenue earned and never collected. This is the other half of
the $94,369.00 sitting in **1150 Unbilled Revenue**.

13 **cancelled** loads also carry no invoice — **that is correct**, cancelled loads must not be invoiced:
13481, 13482, 13485, 13487, 13489, 13493, 13494, 13495, 13496, 13500, 13501, 13623, 90007.

# TIE-OUT 17 — 13595 IS NOT CANCELLED
Status `invoiced`, invoice **sent**, **$1,500.00**, no PO, no W/O. **Not in Faro. Not in the owner's
reconciliation CSV. NOT one of the five unfactored cross-entity loads** (those are 13503, 13504, 13509, 13533,
13539). It is a real, billed load with no customer reference. **Find its rate confirmation.**

# THE OWNER'S POSTING PREFERENCE — 09-30-2026 · **THIS IS ARCHITECTURE, NOT PREFERENCE**
> **"I am not a fan of JE. I would rather categorize always directly, or create a document — expense, bill, bill
> payment, receive payment — and match in banking transactions."**

**Every money movement must be a DOCUMENT, and the document's own engine writes the ledger.**

| Situation | What to create | Never |
|---|---|---|
| Money already paid | **Expense**, credited to the real funding account | a journal entry |
| Owed to a vendor | **Bill** (a Bill *is* Accounts Payable) | posting to 2000 from an expense |
| Paying a bill | **Bill Payment** | a journal entry |
| Customer pays | **Receive Payment** | a journal entry |
| A bank line with a known counterpart | **Categorize it directly** | an adjusting entry |

**A manual journal entry is the last resort, not the tool.** It is for a genuine accounting adjustment that no
document can express — never for correcting a balance, never for clearing an account, never for making two
numbers agree. Every existing plug (the **$166,868.94** against 1090, and account **9000**) is this rule being
broken, and each must be replaced by the document that should have existed.

# THE OWNER'S DISPUTE RULE — 09-30-2026
When our number and the customer's or factor's number disagree and **ours is right**, the answer is **dispute the
balance**, not silently change our books. The **$560.00** on load 13578 — QuickBooks and Faro both say $5,210.00,
we say $4,650.00 — may be a late-delivery deduction or another chargeback. **Establish which is correct from the
rate confirmation first; if ours is right, dispute it. Never adjust our books to match someone else's number
without knowing why.**

# THE OWNER'S RULINGS ON THE NUMBERING CONFLICTS — 09-30-2026
- **Faro 059 used twice (13577 and 13578): Faro made the error.** Our records stand; the duplicate is theirs.
- **13581 / 13582 swap: correct them** to whichever the Faro PO proves, since the PO is the debtor's reference.
- **A load with no PO or W/O is acceptable IF we can match it another way** — settlement document, driver, rate
  confirmation, amount and date. **Matching matters; the identifier is only one route to it.**

---

# TIE-OUT 18 — **RETRACTION: THE "8 UNBILLED LOADS" ARE TRANSPORTATION, NOT USMCA REVENUE**
**Lead reported 8 delivered-but-never-invoiced loads as uncollected USMCA revenue. That was wrong. Withdrawn.**
The owner had already ruled this class of load belongs to **IH 35 TRANSPORTATION**, and Lead re-derived it as a
USMCA finding anyway. **This is the second time Lead has made this exact error.**

## THE SIGNATURE THAT IDENTIFIES THE MIS-FILED BLOCK — use this, not the load number
```
created_at = 2026-09-23 or 2026-09-24   AND   customer_po_number IS NULL
```
Every one of the 14 loads in question matches it: 13497, 13502, 13503, 13504, 13505, 13506, 13507, 13509,
13522, 13530, 13531, 13533, 13539, 13595.

**Two distinct populations sit in the USMCA entity:**

| Population | Loads | Created | No invoice | Customer PO | Faro |
|---|---|---|---|---|---|
| **Bulk import** (below 13550) | 61 | 09-23 / 09-24 | **19** | none | no match |
| **Real USMCA** (13550+) | 88 | 09-23 → 09-28 | 2 | present | matches by PO |

**The load number is NOT the test** — 13595 carries a high number but has the import signature (created 09-24,
no PO). **Use the signature.**

## WHAT THIS CHANGES
- **The 8 "unbilled" loads are not uncollected revenue.** Do not invoice them. Do not value them as USMCA income.
- **13595 is not a missing rate confirmation** — it is the same import block.
- **The 5 "disputed cross-entity loads" (13503, 13504, 13509, 13533, 13539) are the same block.** They were never
  disputed; they were mis-filed, and the owner said so already.
- **`1150 Unbilled Revenue $94,369.00 is contaminated`** by loads that were never USMCA's to bill. **Quantify how
  much of it belongs to the import block before anyone trusts that balance.**
- **Still do NOT delete them.** They are real loads belonging to another entity. They must be re-pointed or
  excluded per the owner's ruling, never destroyed.

# CHROME CLICK-PROOF — DROPPED AS A LINKAGE PROOF (owner ruling, 09-30-2026)
> Owner: *"I spent thousands of dollars on your Chrome live proof checking for linkage and connectivity, and in
> the end it was not wired, linked, etc."*

**He is right, and it is the correct call.** Clicking a screen proves the page renders. **It does not prove a
record is linked, that a foreign key exists, or that a posting landed in the right account.** A screen can render
beautifully over broken wiring — which is exactly what happened in July.

**Linkage is proved by a query, not by a browser:**
- the foreign key exists in `information_schema`, or it does not
- the join returns rows, or it returns zero
- the posting carries the right `account_id`, or it does not

**Chrome is required for exactly one thing: does a control a human presses actually do something.** Nothing else.
**No seat may cite a screenshot as proof of linkage, connectivity, posting correctness, or reconciliation.**
