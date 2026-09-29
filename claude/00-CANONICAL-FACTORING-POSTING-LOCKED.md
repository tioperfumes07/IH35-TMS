# 00-CANONICAL-FACTORING-POSTING — LOCKED
# Claude Lead · 09-29-2026 · One definition. Every factoring entry conforms to it. No exceptions.

## WHY THIS FILE EXISTS

Measured live in USMCA today: the same business event — Faro buys an invoice — is posting **five different
ways**. 98 entries debit Undeposited Funds; 41 skip it entirely; some include the wire-fee account, some do
not; six use a stray reserve account. 25 groups are posted two or three times with copies that **all differ
from each other**. Nothing catches any of it, because every copy balances on its own.

The root cause is not the code alone. `docs/accounting/IH35_ACCOUNTING_BACKBONE_SPEC.md` defines factoring as
"Dr Cash / Cr Factoring Liability" — no reserve debit at funding, no fee treatment, no clearing account. The
engine was built to a spec that never said enough. **This file replaces that section.**

## THE ACCOUNTS (names first — numbers are secondary)

| Name | No. | Type | Role |
|---|---|---|---|
| Undeposited Funds | 1090 | Asset | Funds due from Faro, not yet in the bank |
| Factoring Reserves | 1230 | Asset | The holdback Faro keeps — **mirrors Faro's own reserve ledger** |
| Factoring Advance | 2150 | Liability | What we owe Faro |
| Factoring Fees | 6400 | Expense | Discount fee + schedule fee |
| Bank Service Charges & Wire Fees | 6300 | Expense | Wire fee — **only when Faro actually charged one** |
| Factoring Default Interest | 6830 | Expense | Default interest |
| Bank of America – Operating (USMCA) | 1000 | Asset | The real bank |

**`Faro Cash Reserve` (1235) is NOT canonical.** It carries no `system_purpose`; `Factoring Reserves` (1230)
carries `system_purpose = factoring_reserves`. The 6 entries using 1235 are reclassified to 1230 and 1235 is
deactivated so it cannot spread.

## WHY UNDEPOSITED FUNDS IS IN THE FUNDING ENTRY — SETTLED, SOURCED, DO NOT REOPEN

`docs/reconciliation/2026-09-22-faro-reserve-1230-correction-preview.md`, tied out against the owner's own
Faro exports (`RESERVE REPORT.csv`, `PAYMENTS TO USMCA FROM FARO.csv`, `funds due report 09-21-26.csv`,
`ACCOUNT SUMMARY.csv`), states the rule: **"1230 mirrors Faro's USMCA reserve ledger"** and
**"our funding entries carry funds due from Faro in 1090."**

Faro funds on its own schedule and the wire lands later, often batched across several invoices. The money is
earned and owed the moment Faro purchases; it is not in the bank yet. That gap is exactly what a clearing
account is for, and it is what QuickBooks, NetSuite and McLeod all do. **The 41 entries that skip 1090 are
wrong.**

## THE FOUR CANONICAL ENTRIES

### 1 — PURCHASE / FUNDING (Faro buys the invoice)
```
DR  Undeposited Funds ................ net wire due from Faro
DR  Factoring Reserves ............... holdback Faro keeps
DR  Factoring Fees ................... discount fee + schedule fee
DR  Bank Service Charges & Wire Fees . ONLY if a wire fee was actually charged
    CR  Factoring Advance ............ invoice face purchased
```
**Accounts Receivable is NOT relieved here.** This is recourse factoring under ASC 860 — the receivable stays
on our books until the customer pays. The advance is a liability, not a sale of the receivable. (See
`.block-ready/factoring-asc860-cpa-control-test-open.json`.)

### 2 — WIRE RECEIVED (the money lands)
```
DR  Bank of America – Operating
    CR  Undeposited Funds
```
One wire commonly covers several invoices. The entry books the wire; each invoice's share clears its own
Undeposited Funds balance. A bank line whose amount exceeds any single invoice is **normal**, not a defect.

### 3 — RESERVE MOVEMENT (release to us, or deposit still held)
```
DR / CR  Factoring Reserves
    CR / DR  Undeposited Funds
```
1230's balance must equal Faro's reserve ledger for USMCA at any date. That is the test.

### 4 — CUSTOMER PAYS FARO (the invoice settles)
```
DR  Factoring Advance
    CR  Accounts Receivable
```
This is where A/R is relieved and the liability clears.

**Default interest** (already consistent, 194 entries): `DR Factoring Default Interest / CR Factoring Advance`.

## THE RULES

1. **One code path.** No branch may silently omit Undeposited Funds or swap the reserve account.
2. **Wire Fees posts only when a wire fee exists.** Zero-amount lines are never written.
3. **A funding entry is unique per (advance, posting type).** Enforced by constraint, not by convention.
4. Void follows Seat Contract Section 4 — reversing entry dated the void date, original untouched.
5. Every factoring JE must match one of the four shapes above. A guard fails the build on any that does not.

## WHAT WAS WRONG, AND HOW EACH IS CORRECTED

| Found live | Count | Correction |
|---|---|---|
| Skips Undeposited Funds | 41 | Re-post to shape 1 |
| Uses Faro Cash Reserve (1235) | 6 | Reclassify to Factoring Reserves (1230); deactivate 1235 |
| Wire Fees on entries with no wire fee | — | Remove the line where no fee was charged |
| Duplicate funding entries, copies differ | 25 groups / 28 excess | Owner picks the surviving copy per group, then void the rest |

---

# AMENDMENT 1 — OWNER ORDERS, 09-29-2026

## A. THE BUILD DOES NOT STOP UNTIL IT IS FINISHED
Owner: *"MAKE SURE THE CODER FULLY AND COMPLETELY BUILDS THE ENGINE CORRECTLY, ALL MECHANICAL ETC. NOT HALF OR PARTIALLY, IT DOES NOT STOP UNTIL IT IS FULLY AND TOTALLY BUILT, DONE, WIRED, LINKED, ETC."*

No phase-1-of-3. No "foundation laid." No handing the rest to the next seat or the next round. The seat that
starts this round finishes it: the posting engine, the reversal path, the constraint, the guard, the
reclassification of every non-conforming entry, the UI that reads it, the reports that aggregate it, the QBO
export mapping, and the linkage declarations. **Then** it reports.

**Linkage is part of "built."** Every factoring entry links both ways to: the advance, the invoice, the load,
the customer, the bank transaction, the reserve movement, and its journal entry. A block with no linkage
declaration is not done (Seat Contract Section 8).

## B. WIRE TO THE EXISTING BANKING VIEWS — DO NOT BUILD NEW ONES
Owner: *"YOU ALREADY CREATED THE BANKING VIEWS FOR THE FARO RESERVES AND ESCROW ACCOUNTS."*

The Faro reserve and escrow banking views already exist. The engine wires into them. Do not create a parallel
view, a second reserve surface, or a new screen. Find them, read them, use them, and name them in the report.

## C. THE UNNECESSARY ACCOUNT IS DELETED, NOT JUST DEACTIVATED
Owner: *"THE UNNECESSARY ACCOUNT SHOULD BE DELETED."*

**BUT FIRST, ONE VERIFICATION — RAISED ONCE, THEN EXECUTE.**

`docs/reconciliation/2026-09-22-faro-reserve-1230-correction-preview.md` quotes Faro's own `ACCOUNT SUMMARY.csv`
as carrying **two** reserve buckets, not one:

- **Escrow Reserve — $4,530.19**
- **Cash Reserve — $4,135.41**
- Total **$8,665.60**

Our chart has **Factoring Reserves (1230)** and **Faro Cash Reserve (1235)**. Two buckets at Faro, two accounts
here. It is possible 1235 is not drift at all — it may be the Cash Reserve bucket, with 1230 as escrow.

**So before deleting anything, prove which it is, from Faro's exports, not from the code:**
1. Does Faro hold escrow reserve and cash reserve as genuinely separate balances that must be reported
   separately? The `ACCOUNT SUMMARY.csv` and `RESERVE REPORT.csv` answer this.
2. If YES — 1235 is legitimate, it stays, and both accounts get a `system_purpose` and enter the canonical
   shapes properly. The defect was never having defined which is which.
3. If NO — one bucket, one account. Reclassify the 6 entries to 1230, then **delete 1235** per the owner's
   order. Archive it first; a deleted account with history is only safe once nothing points at it.

Report which case it is with the Faro figures pasted. Do not delete on an assumption.

## D. THE 25 DUPLICATE GROUPS — DETERMINE THE SURVIVOR FROM THE SOURCE, DON'T HAND THE OWNER 25 DECISIONS
The owner should not be asked to hand-pick 25 copies. The surviving copy is **determinable**, and Seat Contract
Section 9 says read the source:

For each of the 25 groups, the correct copy is the one that (a) matches the canonical funding shape above, and
(b) ties to Faro's own figures for that invoice in `RESERVE REPORT.csv` / `ACCOUNT SUMMARY.csv` /
`PAYMENTS TO USMCA FROM FARO.csv`.

Where those two tests agree, that copy survives and the rest are voided — no owner decision needed. Escalate to
the owner **only** the groups the exports cannot settle, and for those show the copies side by side, account by
account, with the delta. Say how many of the 25 fell into each bucket.
