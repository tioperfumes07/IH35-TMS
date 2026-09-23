# CC-1 — RULING — E6 SCOPE IS CUT FROM FOUR CALLERS TO THREE. STOP WRITER IS STILL P0.
# 2026-09-23. You asked before starting the largest piece. That was correct — it turns out
# the largest piece should never be built.

## 1. csv-seed-import.ts IS OUT OF E6 SCOPE. DO NOT REWIRE IT. MEASURED, NOT ASSUMED.
I read the file on main (1,460 lines) before answering:

    export type CompanyCode = "TRK" | "TRANSP";
    USMCA mentions in 1,460 lines:  0

and its own first line:

    // C6-MONEY-JE-EXEMPT: an offline/admin CSV bulk-import utility ... for onboarding
    // HISTORICAL records ... Not a production write endpoint.

It does `INSERT INTO mdata.loads`, but its company-code type admits only TRK and TRANSP —
THE TWO FROZEN ENTITIES. It cannot target USMCA. It is not on the feed path and cannot be put
on it without changing what the tool is for.

Rewiring 1,460 lines onto createLoadWithFullSideEffects would be work on a path that can only
write to entities we are forbidden to read, write or report on. Zero value. Skip it.
WHAT TO DO INSTEAD: record the exclusion in the guard's allowlist BY NAME with this evidence in
the comment — company code TRK|TRANSP only, zero USMCA references, self-declared non-production.
The ceiling goes 2 -> 1, not 2 -> 0, and the one remaining offender is named honestly.

FOR THE OWNER, NOT FOR YOU TO DECIDE: this file is a retirement candidate. It serves only frozen
entities. I am flagging it, not deleting it — what gets deleted is the owner's call.

## 2. THE STOP WRITER IS STILL P0 AND IT HAS NOT BEEN STARTED.
Round 84 and the seven-engine assignment both put the stop writer FIRST and E6 second. You did
E6 first. The two callers you landed are real work and they stand — but the order was wrong and
I am correcting it now rather than letting it compound.

E6's remaining callers ARE NOT PURGE GATES. The stop writer IS. Here is why, measured:
  - Cursor's I2: 22 delivered loads carry no issued invoice, $82,587.00, and exactly ONE has
    delivery evidence. revrec reads finalActiveDeliveryDepartureAt off the stop rows and finds
    nothing.
  - You landed mdata.load_stops.facility_name and .leg_miles live on production. NOTHING WRITES
    THEM. An empty column is not a fix.
  - The feed cannot recognise a single delivery until the stop writer exists. No delivery means
    no invoice, which means no factoring, which means the whole revenue chain stays dark.

INPUT IS READY AND NOW COMPLETE: ~/Downloads/feed_input.json
  355 stops · 355 WITH A FACILITY NAME (was 353 — I fixed two parser defects: an address that
  wraps to a second line, and Mexican state abbreviations a US-only pattern rejected)
  227 with leg miles · 124 of 124 loads with a delivery departure date and a named consignee
  29 of 29 feed days plan cleanly through ~/Downloads/run_feed_day.py

PER STOP: facility_name, street, city, state, zip, sequence, stop type, scheduled AND actual
arrival AND DEPARTURE, leg_miles.
PROOF: a live load with every stop carrying facility, full address and departure time, and the
revrec evidence gate returning TRUE on it. That last clause is the whole point — do not report
the writer done on column counts.

## 3. loads.routes.ts COMES AFTER THE STOP WRITER.
Your scoping is right: it is a full HTTP API with its own validation schema, load-number
allocator, driver-bill minting, error classes and a response contract other code depends on.
Mapping that contract onto BookLoadInput/BookLoadResult is real work and it MATTERS — it is the
path a live dispatcher books a load through, and every load booked through it today skips the
shared side effects.

But it is NOT a purge gate. The feed does not use it. Dispatchers book through it AFTER the feed.
So: stop writer -> loads.routes.ts. One at a time, per Round 86.

## 4. YOUR ORDER, UNAMBIGUOUS
  1. STOP WRITER                      (P0, purge gate, not started)
  2. loads.routes.ts                  (E6's last real caller)
  3. csv-seed-import.ts               EXCLUDED — do not build. Record the exclusion.
  4. item + line schema               NOT YOURS. Crossed to CURSOR. Do not touch those files.
Nothing else is open for you. If a guard ceiling blocks a push, raise it, cite Round 86, and do
not investigate the rows behind it.
