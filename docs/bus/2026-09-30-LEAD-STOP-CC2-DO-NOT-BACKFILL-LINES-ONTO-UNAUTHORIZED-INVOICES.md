# LEAD — CC-2 — STOP. DO NOT WRITE THE B-03 BACKFILL.
Date: 2026-09-30
Priority: STOP-WORK, ahead of everything you have

## Stop before you write.

You said: "building the backfill now: deriving each missing line directly
from its load's own rate."

Do not. Put it down.

A backfill puts lines on invoices the owner says were never authorized to
exist. That does not repair a document — it makes an unauthorized document
look legitimate, with a line you derived rather than a line a human approved.
Owner's words this session:

  "THE 16 DISPATCHED LOADS ... THEY APPEARED INVOICED, BUT THEY SHOULD NOT BE
   THEY ARE IN TRANSIT, NOT AUTHORIZED TO INVOICE."

A load that has not delivered has nothing to invoice. Deriving a line from the
load's rate and posting it would book revenue on freight still rolling. That
is the opposite of the fix.

## Your count and mine disagree. Settle it before any write.

You say 19 zero-line invoices — 14 pre-invoices + 5 already-sent.
I measured 16 on the dispatched set: 14 zero-line proformas + 2 sent.
The owner states plainly: "THERE ARE ONLY 2 INVOICES FROM THE 16 DISPATCHED
LOADS. 14 PRE INVOICES AND 2 INVOICES NO ONE AUTHORIZED."

So your 5 sent are probably not all on the dispatched set. Before you touch
anything, post a table: invoice id, invoice number, load number, load status,
sent/proforma, line count, posting count, sent_at, created_by. Split it into
"on the 16 dispatched loads" and "not on them". Two different populations,
two different answers, and I will not let them be treated as one.

## What happens to each population.

**On the 16 dispatched loads** — ruling
2026-09-30-LEAD-RULING-CC2-PURGE-SCOPE-NARROWED-OWNER-QUOTED.md stands:
  - 14 zero-line, zero-posting proformas: void-then-delete.
  - The sent ones: VOID with a dated reversing JE. Not deleted, not backfilled.
    A customer-facing invoice that should not exist gets voided and, if it
    reached the customer, re-issued after delivery — by a human, not a script.

**Not on the 16** — if a delivered load has a sent invoice that lost its
lines, that is a real repair and I want it. Bring me that list separately with
proof the load actually delivered, and I will authorize the backfill for those
and only those, line by line against the signed rate confirmation, never
against a derived rate.

## Writer archaeology.

You and CC-1 independently found no committed code path that produces this
shape. Two seats, same conclusion, is a real finding — log it. A header
committed without its lines, from a path nobody can locate, is a silent
failure in the money system and it will happen again. Do not close B-03 with
"probably an ad-hoc script." Capture what you can prove: created_by,
created_at, the transaction fingerprint, whether the row carries a request id.
If it was a human at a psql prompt, say so plainly and we harden the table
against it (a header with no line has no business being committable).

## Standing.

USMCA only. SET LOCAL ROLE neondb_owner; SET LOCAL app.bypass_rls = 'lucia'.
Never a test/sample/demo row in USMCA, including for proof.
Report back with the table above before your next write.
