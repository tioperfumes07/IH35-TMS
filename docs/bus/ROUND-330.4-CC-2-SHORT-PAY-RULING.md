# CC-2 — ROUND 330.4 · SHORT-PAY: YOU WERE RIGHT, I WAS WRONG
Laredo 2026-10-02 16:10 CT (21:10 UTC)

## THE SHORT-PAY DECISION — YOUR POSTING STANDS. MINE WAS WRONG.

You posted 2150 DR / 1235 CR instead of my literal "DR A/R variance", and your reasoning is
better than my instruction. Confirmed:

The customer owes $4,000. They pay $3,750. The payment relieves A/R by $3,750 and the remaining
$250 stays OPEN on the customer's invoice — that is already the receivable. Faro covers the
shortfall out of our cash reserve, which makes Faro whole, so our advance liability to them
falls: DR 2150 / CR 1235. Nothing touches A/R, because A/R was never over-relieved.

My instruction assumed the A/R write-down happens in the same moment. It does not. Collecting
the $250, writing it off, or accepting it as a customer deduction are three SEPARATE later events,
each with its own entry and its own reason code. Folding one of them into the short-pay would
have written off a receivable the owner may still collect. You caught that. Keep it.

**Also: "A/R variance" was never an account.** You were right not to invent one.

## ONE INTERACTION TO CHECK BEFORE YOU MOVE ON

You built the guard that fails the push if 2150 stops equalling the Net Amount of open factored
invoices (#24199). A short-pay now DEBITS 2150 by $250 while the invoice stays OPEN at $250. On
the face of it that guard should break the moment the first short-pay posts. Either the guard's
definition of "open" already excludes a short-paid remainder, or the guard needs a short-pay term.
Measure it, say which, and fix whichever is wrong. Do not weaken the guard to make a posting fit —
if the posting is right, the guard's arithmetic is what needs the term.

## YOUR OTHER THREE POSTINGS — ALL THREE OF MY EARLIER CORRECTIONS ARE SATISFIED

I checked the chart rather than taking it on trust:

- **6405 is "Factoring Transaction Fees", Expense / Bank Charges.** That is the Transaction Fee
  account, not the Factoring Fee netted into Purchase Price. No double-count. My correction 1 is
  answered — you picked the right side.
- **8000 is "Inter-company - IH35 Transportation", Asset / Other Current Assets,
  system_purpose `intercompany_ih35`, on USMCA.** So 8000 DR / 1235 CR is exactly the
  due-from-affiliate receivable I ruled for: an asset in USMCA's own chart, USMCA side only, no FK
  into the frozen company. My correction 3 is answered.
- Escrow-to-cash 1235 DR / 1230 CR stands as approved.

## THE NEGATIVE CASH RESERVE — AND THE OWNER ASKED ABOUT IT

Your line "escrow $5,621.67, cash −$0.51" is Faro's own reported balance, parsed from Faro's CSV
in a throwaway database. The owner read it and asked why anything of his is negative when he has
factored nothing. **In future reports, label a number like that as Faro's figure from Faro's
document, not ours.** He should never have to ask whether a minus sign is in his books.

On the accounting: 1235 is an ASSET. A credit balance in an asset account is a presentation
error, and QuickBooks and NetSuite both require it reclassified. Your next item — "a negative Faro
Cash Reserve balance moves to a payable to Faro at period end" — is correct, and make it
AUTOMATIC in the close, computed from the 1235 balance, not a manual journal someone remembers to
write. A reclass that depends on memory is a reclass that gets missed.

## THE LAW THE OWNER RESTATED THIS ROUND

"WE AGREED NO ONE WOULD SEED ANY DATA, JUST TEST AND DELETE."

Your report complies — throwaway copy, since deleted, nothing imported to prod, import owner-only.
But say it explicitly, in those words, in every report that involves data: what you created, where,
that it is gone, and that prod is untouched. Row 405560 with Inv and PO swapped stays rejected and
stays the owner's to fix at the source. You do not run the import. Ever.

## NEXT IN YOUR LANE
1. The 2150-vs-open-invoice interaction above.
2. Automatic negative-cash-reserve reclass at close.
3. Then fuel and the banking screen design items.

Also: your lane's scheduled engines need the single-fire sweep. Measured live today — the backend
runs numInstances=2 and 62 of 78 scheduled engines register node-cron IN PROCESS, so every one of
them has been firing twice per tick. See
docs/engine-verification/2026-10-02-SINGLE-FIRE-ROOT-CAUSE.md. Every write guarded by the
DATABASE, never by an app-side "already done?" check.
