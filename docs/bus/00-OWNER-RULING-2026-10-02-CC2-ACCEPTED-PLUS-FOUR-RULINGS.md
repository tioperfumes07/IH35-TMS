# OWNER RULING — 2026-10-02 — FOR CC-2 (relayed by CC-3)

The owner sent this in the CC-3 chat addressed "CC-3", but every PR in it is CC-2's (#24166 `cc-2/reserve-by-customer`,
#24199 `cc-2/period-close-factoring-interest-2`, #24203 `cc-2/csv-statement-dedup`). CC-3 did not act on it — it is
CC-2's lane (factoring / banking). Verbatim below. ORDER is the owner's: #24166 spine fix, then the repurchase-time
accrual, then the possible-duplicate badge, then the next block.

---

ACCEPTED AS BUILT

#24199 Faro default interest. Accepted. DR 6830 / CR 2155 is the correct pair,
day 36 is the correct start (30-day Repurchase Term + 5-day Grace), 0.067%/day
compounded matches the signed contract. Maker-checker enforced in both the app
and the database is NetSuite-grade and is now the standard for every accrual we
build. The 2150-equals-open-Net-Amount check is a real control — keep it.

#24203 duplicate-import. Accepted, and this was the most valuable thing shipped
today. 399 of 475 lines with no detection key is a live double-post exposure on
every bank account, not a cosmetic bug.

GAP IN #24199 — FIX IT, DO NOT DEFER

Month-end-only is wrong for one path. The Repurchase Price includes Default
Interest through the repurchase date. If an invoice is repurchased or paid on
day 50, interest for days 36-50 must accrue at that moment, inside the same
transaction as the repurchase, or the Repurchase Price we compute is short and
2155 is understated between the event and close. Month-end close handles only
invoices still open at close. Build the repurchase-time accrual on the same
approval path, same account pair, same idempotency key. QuickBooks and NetSuite
both accrue on the triggering event and true up at close; they do not wait.

YOUR #24166 DEFECT — ROOT CAUSE IS DIFFERENT FROM YOUR DIAGNOSIS

You do not need the next block to fix this. The table is reading an invoice tag
off the posting. That is not how this app declares linkage and never was. The
spine is accounting.transaction_source_links, written by writeTransactionSourceLink,
keyed on operating_company_id + journal_entry_posting_id + linked_object_type +
linked_object_id + relationship_role. Repoint the per-customer reserve table to
join through the spine on linked_object_type = invoice. That is the permanent
fix, it is available today, and it is correct no matter what the next block does
to Faro event records. Ship it on its own before the next block. Zero live
movements is why this is cheap right now, not a reason to leave it.

THE 2 IDENTICAL PAIRS — LEAVE THEM

Do not touch them and do not delete them. Two identical same-day transactions
are ordinary in a real bank feed. QuickBooks never auto-removes them; it marks
them "possible duplicate" in For Review and the human decides. Do that: surface
both lines with a possible-duplicate badge and let the owner resolve them at
match time. Your key already keeps genuinely identical pairs separate — keep
that behavior. No deletion, no merge, no script.

NEXT BLOCK — THREE CORRECTIONS BEFORE YOU START

1. Schedule fee. DR 6405 / CR 1235 is only correct if that fee is a Transaction
   Fee. The Factoring Fee is already netted into Purchase Price at purchase
   (Purchase Price = Net − Factoring Fee − Security Reserve). If the Faro
   schedule line is that same fee, expensing it again double-counts it. Prove
   which one it is from the Faro report itself before you write the rule, and
   tell me which.

2. Short-pay. "A/R variance" is not an account and will not survive an audit.
   Give me the two-sided entry per reason code: the debit account for each
   reason (billing adjustment, customer claim, bad debt) against A/R on that
   customer, and separately the reserve movement if Faro funds the shortfall
   (DR 2150 / CR 1235). One combined line hides which of those two things
   happened. Post them as two entries with a shared link, not one.

3. Due-from-affiliate. Permitted on the USMCA side only, and literally only
   that. TRANSPORTATION is frozen — you do not read it, write it, or create an
   FK into it. Book the receivable to an intercompany receivable account in
   USMCA's own chart with the counterparty stored as a text label, no company
   FK. If you cannot do it without touching the frozen company, stop and tell
   me.

Rest of the next block is approved as written: Faro reports as the bank feed for
1230 and 1235, nothing posts until matched or categorized in Banking, one record
per Faro event. The escrow-to-cash rule DR 1235 / CR 1230 is correct.

The malformed-row import is correct to build and correct for you not to run.
Owner runs every import. Nobody seeds anything, including you, including for
proof.

ORDER: #24166 spine fix, then the repurchase-time accrual, then the possible-
duplicate badge, then the next block.

Every one of these lands with the live proof pasted into the commit — deploy id,
migration sha, the query and its result. No fake green.
