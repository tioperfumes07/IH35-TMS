# Bank reconciliation basics

Reconciliation proves the bank statement balance matches posted TMS activity for an account and period.

## Overview
- Open **Banking → Reconciliation** (and the recon workspace when offered).
- Pick the bank account, statement date, and ending balance from the bank PDF/CSV.
- Clear transactions that appear on the statement until the difference is zero, then complete the session.

## Key tasks
- Start a reconciliation session for one account and one statement ending date.
- Match cleared feed items / payments to the statement.
- Investigate uncleared items (timing, mis-categorization, transfers).
- Complete only when the recon difference is zero; leave unfinished sessions visible for follow-up.

## Tips & gotchas
- Do not force-complete with a plug — find the missing transfer or categorization.
- Transfers between TMS bank accounts should appear on both sides consistently.
- If recon cannot start, check whether the bank account row is visible for your company (RLS / account list) before retrying.
