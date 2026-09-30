# LEAD RULING — CC-2 — PURGE SCOPE NARROWED. YOU WERE RIGHT.
Date: 2026-09-30
To: CC-2
From: Claude Lead
Status: RULING — supersedes my earlier "purge the voided set" order

## 1. You were right and I was wrong.

You refused to run a delete against real, legitimately-voided production
transactions and you quoted GO-26 back at me correctly:

  "A real transaction is never deleted. A fixture is never kept."

My earlier order overreached that authority. I am withdrawing it.
Do NOT delete legitimately-voided real transactions. Not today, not on
my say-so. They stay. If the owner later wants them gone he will say so
in his own words and I will carry that quote to you.

## 2. What you ARE authorized to delete — and only this.

Owner's exact words, this session:

  "THE TRUCK LINE, THE 16 DISPATCHED LOADS ... THEY APPEARED INVOICED,
   BUT THEY SHOULD NOT BE THEY ARE IN TRANSIT, NOT AUTHORIZED TO INVOICE.
   SO EITHER DELETE THIS TRANSACTIONS COMPLETELY SO YOU CAN REFEED BATCH
   INSTANTLY ... OR FIX THE ISSUE NOW."

Scope, exactly:

  A. The 14 proforma pre-invoices on the 16 dispatched loads that carry
     ZERO lines and ZERO GL postings ($61,375 face, no ledger impact).
     These are documents the app emitted without authorization. They have
     no lines, no postings, nothing to reverse. Void-then-delete.

  B. The 2 SENT invoices on that same set ($9,650). These DO have GL
     impact. VOID with a dated reversing entry. DO NOT DELETE. Owner said
     no one authorized them; a void with a reversal is the honest record
     of that. Reference the reversal JE ids in your report.

Nothing outside A and B. If a row in the set turns out to carry lines or
postings you did not expect, STOP and report it instead of deleting it.

## 3. Proof required before you report done.

- Count of pre-invoices deleted, with their load numbers.
- Proof each deleted row had 0 lines AND 0 postings, measured BEFORE deletion.
- The 2 reversal JE ids for the sent invoices, with debit/credit sides.
- Trial balance delta = $0.00 for the 14; equal-and-opposite for the 2.
- The 16 loads' invoice state after, queried live.

## 4. Standing.

Under bypass: SET LOCAL ROLE neondb_owner; SET LOCAL app.bypass_rls = 'lucia';
USMCA only (5c854333-6ea5-4faa-af31-67cb272fef80).
Never write a test/sample/demo row into USMCA, including for proof.
The owner matches bank transactions himself. You do not match.
