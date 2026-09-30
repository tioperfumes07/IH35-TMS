# CC-2 — ROUND 301 STANDING QUEUE (B-31 .. B-37)

Finish an item, ACK in OUTBOX-CC-2.md, start the next. Do not wait for a new order.
Reads require: SET LOCAL ROLE neondb_owner; SET LOCAL app.bypass_rls = 'lucia';
USMCA only (5c854333-6ea5-4faa-af31-67cb272fef80). Relayed directly, recorded here verbatim as
the citable order record (same pattern as ROUND 297.3/299/300).

## B-31 — THE A/R OVERSTATEMENT

$366,409.12 open against $15,507.60 recorded collected, while Faro shows $28,125.00 collected
in September. Trace it. Guard 11963 is already reserved in CLAIMED-NUMBERS.json.
DO NOT net anything to make it balance. Name where the relief is missing and prove it with rows.

## B-32 — THE MATCHED SIDE OF RECONCILIATION (pairs with CC-1's A-27)

CC-1 owns the reconciliation engine. You own the bank-feed side of MATCHED: what makes a GL row
and a bank-feed row the same event. Amount, date window, account, stable transaction key.
The owner's standing ruling is in
09-23-2026-OWNER-DECISION-BANK-MATCH-WINDOW-DATE-CASCADE.md. READ IT. Do not re-decide it.
THREE outcomes, never two: matched / unmatched / matched-with-difference.
banking.bank_transactions holds 12,325 rows across all entities; the USMCA slice on the
Banking screen is 947.

## B-33 — DIESEL CARD AND FUEL WALLET

Dreamline -$140,226.34, 397 of 397 uncategorized.
Relay -$32,726.45, 76 uncategorized, $20,942.94 that will not post because no unit resolves.
AUTH-178 committed 52 of 52 and 177 of 177 live USMCA fuel rows now carry a unit_id.
So the remaining 76 are a DIFFERENT population. Say plainly what they are and why they differ.
Do not re-run AUTH-178 logic against them without a fresh dry run.

## B-34 — ATTRIBUTE THE 116 EXISTING safety.integrity_findings TO DRIVERS

They ALREADY EXIST, written by a cron. DO NOT BUILD A SECOND INTEGRITY ENGINE.
Attribute them with driverAtTimeSql from driver-attribution.ts - the helper you wrote.
Never assigned_driver_id.

## B-35 — THE TWO VIRTUAL LEDGERS

Factoring Reserve $4,992.75. Driver Escrow Pool $2,375.00 across 14 drivers.
Neither is backed by a real account.
ESCROW IS A LIABILITY - the company owes it back. If anything books escrow to an EXPENSE
account it overstates cost and hides a debt. PROVE that number is zero, with the query.
Then name the real account that should back each ledger.

## B-36 — QBO IS NOT CONNECTED, LAST SYNC NEVER

Report what connecting would push today and what it would overwrite. DO NOT CONNECT.
Reconcile first is the order. Syncing an unreconciled feed writes the same mess into QuickBooks.

## B-37 — re-read this file.

LANE BOUNDARY: you do not touch apps/frontend, and you do not touch the reconciliation engine
itself - that is CC-1's A-27. You own the matching side only.
DONE on every item = one PR, one named guard, live proof pasted.
