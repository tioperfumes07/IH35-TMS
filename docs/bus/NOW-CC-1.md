# ROUND 155.2: 14/18 loads ready, 4 blocked on real data gaps — CC-1 — 2026-09-28 08:10Z
Archived: `docs/bus/archive/NOW-CC-1-2026-09-28-10.md`.

DONE, LIVE: 5 customers created (AUTH-085). 4 more leftover driver duplicates merged beyond the
order's named list — HUGO GAYTAN SARABIA x2 (also corrected his name, missing "Sarabia"),
GENARO GUERRERO CHAVEZ x1, EDUARDO AZAEL FLORES ORTIZ x1 (0-load both sides, survivor by Samsara
id). The order's own named 4 (CARLOS MAURICIO/LUIS ARMANDO/ANGEL ALFONSO/LEONEL) were ALREADY
fully resolved by AUTH-081 — no action needed, order was stale on this point.

FIXED 4 real bugs in the booking script (never rewrote PLAN or the bookLoad loop): mdata.customers
resolver used nonexistent name/is_active columns (real: customer_name/deactivated_at); mdata.units
has no operating_company_id (155.2.a, confirmed — fixed to currently_leased_to_company_id);
trailers are NOT in mdata.units at all (0 rows of that type exist) — real table is mdata.equipment;
and a serious pooled-connection bug where bare set_config + un-transacted queries silently lost
RLS scope between statements (one read went 3->49 phantom failures between runs) — fixed by
wrapping resolution in explicit transactions. Added the required preflight (refuses whole run,
reports every unresolved ref at once). 3 consecutive runs now give an IDENTICAL, stable result.

RATE VERIFICATION (155.2.d) against signed PDFs in Downloads: 13637 CONFIRMED $5,200.00 exactly.
13634 does NOT confirm $4,600 — signed rate con states "Total Load Value: UNDECLARED" twice. Per
the order's own rule (PDF wins, never book at 0), 13634 is excluded, not booked at either number.

BLOCKED, NEED LEAD INPUT (14 of 18 are otherwise ready to book the instant these clear):
1. 13634 rate — PDF shows UNDECLARED, not $4,600. Need the owner's real source for this number.
2. 13623 & 13631 trailer "568871" — doesn't exist in mdata.equipment, not in any rate-con PDF,
   IS identical to 13623's own work-order number (likely a transcription mix-up).
3. 13627 trailer "21868" — same situation, no real trailer found anywhere.
No historical truck-to-trailer pairing exists for T174/T170 to infer from. Never guessed.
