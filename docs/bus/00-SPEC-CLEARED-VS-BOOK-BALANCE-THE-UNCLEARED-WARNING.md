# SPEC — CLEARED vs BOOK BALANCE. THE UNCLEARED WARNING. THIS BEATS QUICKBOOKS.

Owner, 2026-10-03: *"ONE DEFECT OF QUICKBOOKS IS THAT IF YOU APPLY A PAYMENT... THE BALANCE IS BROUGHT
DOWN, BUT IF YOU STILL HAVEN'T MATCHED THAT PAYMENT AND YOU DO NOT HAVE YOUR ACCOUNTS RECONCILED, THE
BALANCE IT SHOWS IS NOT REAL. I OWE JUAN PEREZ 1000 FOR LOAD 1 AND 1000 FOR LOAD 2. I CREATE A BILL
PAYMENT FOR LOAD 1, 500. THE DRIVER BALANCE SHOWS 1500. BUT IF I NEVER REALLY SENT THE BILL PAYMENT, THE
BALANCE IS NOT REAL. SO WHEN SHOWING A BALANCE, MAYBE WE SHOULD SHOW A MESSAGE, BILL PAYMENT NUMBER DATE,
ETC. NOT CLEARED."*

**He is right, this is a genuine weakness in QuickBooks, and his fix is the correct one.** QuickBooks
surfaces outstanding items only inside the reconcile screen — never on the vendor balance, the customer
balance, or the A/P and A/R aging reports. Those all show **book** balance and present it as fact.

## CORRECTION 2026-10-03 — THE REGISTER ALREADY HAS THIS. THE LEAD WAS WRONG.
The owner reminded me he had already asked for cleared/uncleared in the chart of accounts register and in
reconciliation. **He is right and it is built.** `account-register.service.ts:57`:

    QBO ✓ — blank | C (matched to bank feed OR register_cleared) | R (locked by closed reconciliation)

QuickBooks' ✓ column exactly, with reconciliation writing the flag through a single writer.

**My "0 of 7,909" below was a wrong conclusion from a right number.** `register_cleared` is only ONE of
the two sources of C; the other is the **bank-feed match**, computed live in the read model. I measured the
manual column, saw zeros, and declared us worse than QuickBooks without reading the register service.
**Do not repeat that: a status with two sources is not measured by one column.**

**AND THE OWNER'S CORRECTION ON WHAT CLEARS — TAKE THIS AS THE RULE:**
**Cleared = CATEGORIZED *or* MATCHED in banking.** Not match alone. A categorized line came FROM a real
bank line, so the money provably moved. Created in the app and not yet matched = **uncleared**.

    categorized from the bank feed        -> CLEARED immediately
    created in the app, later matched     -> CLEARED at the match
    created in the app, not yet matched   -> UNCLEARED   <- the owner's Juan Perez 500.00

## THE REAL REMAINING GAP — NARROWER THAN FIRST WRITTEN
The C/R status exists in the register and in reconciliation. **It does not appear where the owner makes
decisions about people:** the vendor balance, the customer balance, the driver balance and settlement
statement, and the A/P and A/R aging reports. Those still present book balance as fact.
**Carry the status that already exists onto those screens. Do not rebuild the register.**

## ORIGINAL MEASUREMENT, KEPT FOR THE RECORD
    accounting.journal_entry_postings.register_cleared     0 of 7,909 postings marked cleared
    accounting.bill_payments.cleared_date                  column exists
    accounting.payments.cleared_date                       column exists

**The columns exist and nothing ever populates them.** So today every balance in the system is a book
balance with **no cleared/uncleared distinction at all** — we do not even have QuickBooks' partial answer.
The structure to fix it is already in place; nothing is using it.

## THE MODEL — THREE NUMBERS, NOT ONE, EVERYWHERE A BALANCE IS SHOWN
    BOOK BALANCE       what the ledger says. What QuickBooks shows. Still correct accounting.
    UNCLEARED          payments posted but not yet cleared the bank — ITEMISED, never just a total
    CLEARED BALANCE    book adjusted for uncleared. What is actually true in cash terms.

**The owner's example, as it must render:**

    Juan Perez
      Book balance                                    1,500.00
      ⚠ Includes 500.00 in uncleared payments
          Bill Payment 1023 · 09/28/2026 · 500.00 · NOT CLEARED · 5 days outstanding
      Cleared balance                                 2,000.00

Both numbers are shown, both are labelled, and the operator is never asked to guess which is real.
**Never silently replace the book balance** — that would be wrong accounting. Show both, name the gap.

## WHAT MARKS SOMETHING CLEARED — AND IT FALLS OUT OF ROUND 360 FOR FREE
**The bank match is what clears it.** This plugs straight into the state machine CC-2 is already building:

    MATCH    → set bill_payments.cleared_date / payments.cleared_date, set register_cleared on the
               payment's postings, from the BANK LINE's date
    UNMATCH  → clear cleared_date and register_cleared. The item goes back to uncleared.
    Manual reconciliation → the same flags, same way

A payment only becomes cleared when the money is seen leaving the bank. Nothing else may set those flags.

## WHERE IT MUST APPEAR — EVERY BALANCE, NO EXCEPTIONS
Vendor balance · customer balance · driver balance and the driver settlement statement · A/P aging ·
A/R aging · the Finance Hub and dashboard tiles · the vendor and customer detail screens ·
the 425C / monthly operating report.

**The aging reports carry the same blind spot and must carry the same warning.** An A/P aging that says
1,500 is owed to Juan, when 500 of that reduction never left the bank, is telling the owner something
untrue at the exact moment he is deciding who to pay.

## THE STALE-UNCLEARED ALERT — THIS IS A CONTROL, NOT A CONVENIENCE
A payment that stays uncleared is one of three things: **never sent · lost · or never real.**
- Uncleared beyond the owner's 7-day threshold (A1) → flag on the balance.
- Uncleared beyond 30 days → escalate to an exception report, by vendor and by amount.

The owner has recorded embezzlement losses in this company's history (CPA answers, item 18). **A report of
payments created but never cleared is precisely the control that catches a payment that was entered and
never sent.** It costs nothing beyond this feature and it is the strongest internal control on the board.

## HOW IT IS BUILT — IT IS DERIVED, PER THE LAW
Nothing here is a stored balance. Uncleared = the postings of payment documents whose `cleared_date` is
NULL, summed per vendor / customer / driver from the ledger. **It obeys the store-vs-derive law: a number
a CPA could recompute from the postings is derived.** No new running total, no new cache.

Guard `verify-cleared-flags-only-set-by-a-bank-match` — no `cleared_date` or `register_cleared` set on a
document with no matched bank line. Ceiling **0**, baseline committed, run unscoped.

## ASSIGNMENT
**CC-2 — fold the clearing flags into ROUND 360.** Match sets them, unmatch clears them. It is the same
transaction and the same engine; do not build it twice.
**Cursor — the three-number display and the uncleared itemisation** on every balance and both aging
reports, plus the stale-uncleared exception report.

**Finish test:** the owner's own case on a fork — two loads, one partial bill payment, payment unmatched.
The screen must show book 1,500.00, the itemised uncleared 500.00 with its number and date, and cleared
2,000.00. Then match it to a bank line and watch all three converge, instantly, in one transaction.
