# CC-2 — ROUND 329.1 · #24199 GAP, #24166 ROOT CAUSE, FARO NEXT BLOCK
Laredo 2026-10-02 14:52 CT (19:52 UTC)

## ACCEPTED AS BUILT
#24199 Faro default interest — DR 6830 / CR 2155, day 36 start (30-day Repurchase
Term + 5-day Grace), 0.067%/day compounded. Matches the signed contract. Maker-checker
in both app and database is now the standard for every accrual we build.
#24203 duplicate-import — accepted. 399 of 475 USMCA lines with no detection key was a
live double-post exposure on every bank account.

## GAP IN #24199 — FIX, DO NOT DEFER
Month-end-only is wrong for one path. The Repurchase Price includes Default Interest
through the repurchase date. An invoice repurchased or paid on day 50 must accrue days
36-50 at that moment, inside the same transaction as the repurchase, same approval path,
same account pair, same idempotency key. Month-end close handles only invoices still open
at close. QuickBooks and NetSuite accrue on the triggering event and true up at close.

## #24166 — YOUR ROOT CAUSE IS WRONG
The table reads an invoice tag off the POSTING. That is not how this app declares linkage.
The spine is accounting.transaction_source_links, written by writeTransactionSourceLink,
keyed operating_company_id + journal_entry_posting_id + linked_object_type +
linked_object_id + relationship_role. Repoint the per-customer reserve table to join
through the spine on linked_object_type = invoice. One join. Available today. Ships
BEFORE the next block, not inside it. Zero live movements is why it is cheap now, not a
reason to leave it.

## THE 2 IDENTICAL PAIRS — LEAVE THEM
No delete, no merge, no script. Two identical same-day transactions are ordinary in a real
bank feed. QuickBooks badges them possible-duplicate in For Review and the human decides.
Build that badge. Your key already keeps genuinely identical pairs separate — keep it.

## NEXT BLOCK — APPROVED WITH THREE CORRECTIONS
1. Schedule fee. DR 6405 / CR 1235 only if that line is a Transaction Fee. The Factoring
   Fee is already netted into Purchase Price (Purchase Price = Net − Factoring Fee −
   Security Reserve). Expensing it again double-counts. Prove from the Faro report which
   one it is and tell me.
2. Short-pay. "A/R variance" is not an account. Give the two-sided entry per reason code —
   debit account per reason (billing adjustment, customer claim, bad debt) against A/R on
   that customer — and the reserve movement (DR 2150 / CR 1235) as a SEPARATE linked entry.
   One combined line hides which of the two events happened.
3. Due-from-affiliate. USMCA side only, literally only. TRANSPORTATION is frozen: no read,
   no write, no FK into it. Intercompany receivable in USMCA's own chart, counterparty as a
   text label, no company FK. If you cannot do it without touching the frozen company, stop
   and tell me.

Approved as written: Faro reports as the bank feed for 1230 and 1235, nothing posts until
matched or categorized in Banking, one record per Faro event, escrow-to-cash DR 1235 /
CR 1230. The malformed-row import is correct to build and correct for you not to run.
Owner runs every import. Nobody seeds anything, including you, including for proof.

## ORDER
#24166 spine fix → repurchase-time accrual → possible-duplicate badge → Faro bank-feed
block. #24200 runs in parallel. Live proof pasted in every commit — deploy id, migration
sha, the query and its result. No fake green.
