# LEAD RULING — CC-1 — THE 21-vs-10 STATUS GAP. DO NOT MAP. DO NOT SQUASH. — 2026-09-23

You were right to stop. Your recommended option — "I pick the nearest DispatchStatus equivalent
for each of the 6" — is the one option that must not happen, and here is why in the business's
own terms, not the type system's.

## WHY A "NEAREST EQUIVALENT" MAPPING DESTROYS MONEY
  at_pickup  -> in_transit   The truck is SITTING AT THE SHIPPER. That is detention. Detention
                             is billable revenue (4210 Detention Income) and the broker pays it
                             only against evidence. Collapsing at_pickup into in_transit erases
                             the record that justifies the charge. We just built the accessorial
                             items for exactly this revenue.
  at_delivery -> in_transit  Same, at the consignee end.
  delivered  -> delivered_pending_docs
                             Those are different facts. "Delivered" is delivered. "Pending docs"
                             means delivered AND WE DO NOT HAVE THE POD. The POD is what gates
                             invoicing, and a missing POD is short-pay reason 4920. Writing
                             "pending docs" onto a load whose POD we hold invents a defect;
                             writing "delivered" onto one we cannot document hides a real one.
  booked / planned / assigned
                             Pre-dispatch lifecycle states a dispatcher actually uses to run the
                             board. Squashing them makes three different operational realities
                             look identical on every board we just spent a week fixing.
A status is not a label. Six of them carry money or evidence. None get squashed.

## THE RULING — A CREATE CALL VALIDATES, IT NEVER COERCES
The gap is not really 21 vs 10. It is that a load's FULL LIFECYCLE vocabulary and the set of
statuses a load may legally BE CREATED IN are two different sets, and nobody separated them.
You do not create a load that is already `paid`. You DO create one that is already `delivered`
when you are rebuilding history.

So:
  1. DispatchStatus is NOT narrowed and the route's 21 values are NOT narrowed. Neither
     vocabulary loses a value. This also avoids inventing an eleventh load-status definition,
     which Cursor already warned about — import the canonical one, never redeclare it.
  2. createLoadWithFullSideEffects takes the requested status and VALIDATES it against what is
     legal FOR THAT MODE:
        mode = 'live_feed'            legal initial statuses only — draft, booked, planned,
                                      unassigned, assigned, assigned_not_dispatched, dispatched.
                                      Anything downstream of dispatch is REJECTED with a named
                                      error (load_status_not_valid_for_create), never coerced.
                                      A live dispatcher cannot book a load that is already
                                      invoiced, and if the UI asks for that, that is the bug.
        mode = 'historical_backfill'  ALL 21 are legal, because we are recreating loads that
                                      genuinely are already delivered, invoiced or closed.
                                      This is exactly what the 124-load feed does.
  3. If a caller sends a status with no home, it gets an error naming the status and the mode.
     It never gets silently rewritten into something adjacent. Silent coercion is how a
     detention claim disappears.
  4. Where DispatchStatus genuinely lacks a value the route already writes, EXTEND
     DispatchStatus. Same rule I gave you for the response contract: if a field has no home,
     extend the target — do not drop the field.

## PROOF REQUIRED
  - a live_feed create with status='invoiced' is REJECTED, by name, and writes nothing
  - a historical_backfill create with status='delivered' SUCCEEDS and the load reads back
    'delivered', not 'delivered_pending_docs'
  - all 21 route values round-trip in historical_backfill with no value changed
  - no new status list is declared anywhere; the canonical one is imported

## AND — REVERSE THE csv-seed-import EXCLUSION. THE OWNER OVERTURNED IT.
You merged the exclusion. That was my instruction and the owner overturned it the same hour:
  "WHY SHOULDNT IT WORK FOR USMCA? WE MIGHT NEED IT TO IMPORT DATA AS WELL WOULDNT WE?"
He is right and I was wrong. I recommended sidelining a bulk-import tool for a company that is
about to bulk-import 124 loads and will import more later. TRK|TRANSP is a DEFECT TO FIX.
Reverse the exclusion, remove the allowlist entry, and put the ceiling back to 2. It goes to
ZERO when both real callers land. There is no permanent named exception.
Scope for that file is in ~/Downloads/09-23-2026-CC-1-OWNER-RULING-ALL-THREE-BUILT-FULLY.md.

## YOUR ORDER
  1. STOP WRITER — re-proven on real feed_input.json data (load 13471, Amerinox pickup, Rpr
     Products delivery, finalActiveDeliveryDepartureAt returning a real timestamp). ACCEPTED.
     That is the proof standard I asked for and you met it. Nothing further.
  2. reverse the csv-seed-import exclusion (small, do it now)
  3. loads.routes.ts under this ruling  — AFTER the purge
  4. csv-seed-import.ts to USMCA        — AFTER the purge
The item + line schema stays CURSOR's (202614271200). Do not touch those files.
