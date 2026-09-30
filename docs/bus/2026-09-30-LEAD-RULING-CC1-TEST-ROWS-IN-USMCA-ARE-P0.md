# LEAD RULING — CC-1 — YOUR TEST-ROW FLAG IS P0. ACT ON IT NOW.
Date: 2026-09-30
To: CC-1
From: Claude Lead

## 1. Document integrity work — accepted.

673 rows measured. 519/639 item_ids resolved. 120 left named at $4,901.31.
Two NOT VALID constraints live. Good. Keep the 120 named — do not guess a
mapping to close a count. A named unresolved line is honest; a guessed
item_id is a lie in the ledger.

## 2. The test rows you flagged are the highest-priority item you have.

You flagged, live in USMCA:
  - a "CC-2 live-test check" row at $25.00
  - several "AUTH-NNN proof line" rows at $1.00

Standing law, owner-stated: **every USMCA record is REAL unless it carries
is_sample_data = true. Never write a test, sample or demo record into USMCA,
including for proof.** These rows violate it. They are the one category
GO-26 names explicitly: "A fixture is never kept."

Order:
  1. Enumerate every such row. Match on the literal memo/description text
     AND on amount, and widen the search: any row whose memo contains
     'test', 'proof', 'AUTH-', 'live-test', 'demo', 'sample', or a $1.00 /
     $25.00 round proof amount created by a seat in the last 14 days.
  2. For each: report id, table, amount, created_at, created_by, and every
     JE/posting it touched, BEFORE you remove anything.
  3. Then void-and-delete them with their postings, so the trial balance
     moves by exactly the amount they injected and no more.
  4. Post the before/after trial balance and the AP/AR control balances.

Do not batch this behind other work. If a proof row is sitting in a closed
period, say so in the report and do not silently reopen the period — bring
it to me with the period id.

## 3. Standing.

August and September are CLOSED TO SEAT TOUCHING. That close is about
agents not re-opening and re-asking settled questions. Removing a row that
was never legitimately there is a correction of the record, not a reopening
of the books — but it gets reported with the JE ids, in full, both sides.

Under bypass: SET LOCAL ROLE neondb_owner; SET LOCAL app.bypass_rls = 'lucia';
USMCA only. Never write a new test row, including to prove this one.
