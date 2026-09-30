# LEAD RULING — CC-2 — THE 5 ZERO-LINE INVOICES. THE POD DECIDES, NOT THE STATUS.
Date: 2026-09-30
Loads: 13616 / 13618 / 13620 / 13621 / 13622

## 1. Withdrawing AUTH-174 without writing was correct.

You stopped before a production write on a document you could not justify.
That is the standard. Noted and accepted.

## 2. Measured live, 2026-09-30, before this ruling.

  load    status     unit    last status write
  13616   invoiced   T171    2026-09-28 11:36:03Z
  13618   invoiced   T156    2026-09-28 12:51:35Z
  13620   invoiced   T168    2026-09-28 12:51:50Z
  13621   invoiced   T175    2026-09-28 11:26:46Z
  13622   invoiced   T164    2026-09-28 12:51:05Z

Two facts fall out of that table and they change your conclusion:

**a. Every one of those units — T171, T156, T168, T175, T164 — is now under a
DIFFERENT, currently-dispatched load.** The truck finished and moved on. That
is consistent with the freight having physically delivered.

**b. Not one of them ever passed through 'delivered'. They went to 'invoiced'
directly.** That is not a data-entry quirk. It is T-01: arrival detection is
wired only to a Samsara webhook that has never fired (0 rows, ever), so
nothing in this system has written a delivery stamp in two days. Root cause
is in claude/00-MASTER-WORK-REGISTER-2026-09-30-ASSIGNED-AND-SEQUENCED.md.

## 3. So do not rule off the status column. It is proven untrustworthy.

You proposed "likely void, matching the pattern." I am not taking that, and
neither is the pattern from 13625/13626 — where I declared loads unfactored
off an empty table and was wrong, because the table was empty for a reason
that had nothing to do with the loads. Same trap, same shape. An absent
record is a question, not an answer.

**The POD decides.** Not the status, not the missing authorization row.

For each of the 5, pull:
  - every docs.files row linked to the load: POD, signed BOL, delivery
    receipt, and the timestamp and uploader on each
  - the last known GPS position for that unit around the delivery window,
    from integrations.samsara_vehicle_positions, against the delivery stop's
    address
  - the customer's own record: did they pay, short-pay, or dispute it
  - whether the invoice actually left the building (sent_at, and to whom)

Then split them:

**POD present, or GPS puts the truck at the delivery address in the window**
→ the freight delivered. The invoice is legitimate in substance and lost its
lines to the same header-without-lines defect. Backfill is authorized for
these — **line by line against the signed rate confirmation**, never a rate
derived from the load record. Post the lines, post the GL, and stamp the
delivery date from the POD, not from today.

**No POD and no GPS corroboration** → the document should not exist. VOID
with a dated reversing JE. Do not delete: it was sent to a customer, and a
void with a reversal is the honest record of that. If it reached a customer,
say so in your report and name the customer — the owner decides what goes
back to them, not you and not me.

## 4. The defect underneath both buckets.

A load reached 'invoiced' without ever being 'delivered', and an invoice
header committed without its lines. Both are silent failures in the money
path. When you are done with the 5, both get a guard:
  - no load transitions to 'invoiced' from any state that is not 'delivered'
  - no invoice header commits without at least one line (enforce at the
    table, not at the call site)
Finish those in the same session. Under the FINISH LAW, the 5 are not closed
until the hole that made them is closed too.

## 5. Standing.
USMCA only. SET LOCAL ROLE neondb_owner; SET LOCAL app.bypass_rls = 'lucia'.
Never a test/sample/demo row in USMCA, including for proof.
Report the split table before any write.
