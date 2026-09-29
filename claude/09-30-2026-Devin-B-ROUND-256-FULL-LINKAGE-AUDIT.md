# ROUND 256 — DEVIN-B — THE FULL LINKAGE AUDIT. FIND EVERY BREAK.

## ANTI-DRIFT CONTRACT — READ BEFORE THE FIRST LINE OF CODE
1. You build EVERY item on your list COMPLETELY: schema, migration, backend service, route DEFINED
   and MOUNTED and CONSUMED by a real frontend surface, GL postings, linkage both ways to every hub,
   catalogs, guards, backfill, and print where it applies. **The Check Creator was reported DONE
   while sitting unmounted and dead for weeks. That must never happen again.**
2. NO HANDING OFF. If something blocks you, you MEASURE it, FIX it, and report what you fixed. The
   only thing you escalate is a write the owner has not authorized.
3. NO PATCHING. Root cause only. No report-only guards, no skips, no `--no-verify`, no exception
   lists, no "same pattern as X" without evidence.
4. NO DRIFT. Do not invent tables, concepts or names not in this document. Do not rename anything.
   Do not "improve" the design. If you believe something here is wrong, say so in ONE paragraph with
   the measurement that proves it, then do what this document says.
5. NEVER write test, sample or demo rows into USMCA — including for proof. Two seats broke this and
   are still reconciling it.
6. USMCA ONLY: 5c854333-6ea5-4faa-af31-67cb272fef80. TRANSPORTATION and TRUCKING stay frozen.
   Reads require BOTH lines: `SET LOCAL ROLE neondb_owner;` then `SET LOCAL app.bypass_rls = 'lucia';`
7. Blank is blank. Unknown prints `—`. Never 0 for unknown, never a substituted value.
8. Every guard is REQUIRES_LIVE_DB. A guard that cannot connect is a FAIL, never a pass.
9. Save your completion report to the repo at `claude/<date>-<SEAT>-<ROUND>-REPORT.md` so nothing is
   lost. Cite live SQL output for every claim. Never report DONE without pasted proof.
10. You have API keys available in the Desktop files. No seat may claim it lacks a key.

## ACCEPTED AND CLOSED
129 unguarded casts tiered load-to-cash first, fail-closed not fail-open. 228 exports, 224 mounted,
4 unmounted all explained. Both verified by the Lead. Push your held branch the moment CC-3's ROUND
234 lands.

## ITEM 1 — THE FULL LINKAGE AUDIT. OWNER ORDER.
Owner: *"verify all those transactions, what load they come from... have a coder find the full and
correct linkage, audit and wire correctly, as well as cash flow, load boards, pre-settlements."*
Every money row in the system must resolve to the LOAD it came from, in BOTH directions. Produce the
canonical linkage map and every break in it.
TRACE EVERY CHAIN, END TO END:
  load → stops → unit → driver → trailer → customer
  load → rate confirmation (`docs.files`) → invoice → factoring submission → Faro purchase → cash
  load → fuel transaction → expense → expense_line → item → account → journal entry
  load → driver settlement → driver bill → bill payment → bank transaction
  load → company settlement → margin → statistical accounts
  load → tour / pre-settlement → load board row
  load → downtime event → event costs → lost opportunity
FOR EACH CHAIN REPORT: total rows · rows with a complete chain · rows with a BREAK, and at which hop
· the count and dollars behind each break class.
**FIND IT AND FILE IT. DO NOT FIX IT** — these span every seat's surface. File as
`claude/09-30-2026-DEVIN-B-FULL-LINKAGE-AUDIT.md` with one table per chain.

## ITEM 2 — THE SPECIFIC BREAKS ALREADY KNOWN. CONFIRM OR REFUTE EACH, MEASURED.
- 349 of 382 load stops have no coordinates.
- `telematics.odometer_readings` is empty, so no load has driven miles.
- 15 invoices delivered and invoiced but in NO Faro file: 13498, 13513, 13517, 13525, 13527, 13540,
  13541, 13555, 13572, 13578, 13582, 13595, 13609, 13616, 13621.
- 5 loads factored under IH 35 TRANSPORTATION yet carrying USMCA invoices: 13503, 13504, 13509,
  13533, 13539.
- Load 13525 carries a $0.00 invoice marked sent.
- The truck line board shows 11 loads; the database says 14 dispatched; the owner counts 16 running.
- `downtime.event_costs` and `downtime.lost_opportunity` are both empty.

## ITEM 3 — CASH FLOW, LOAD BOARDS, PRE-SETTLEMENTS
Audit each surface for whether it resolves from the SAME canonical definitions the rest of the app
uses, or from its own private query. Every place a surface has its own status list, date rule or
entity filter is a divergence and gets named.

## PROOF REQUIRED
The linkage map file with one table per chain · break counts and dollars per class · confirm/refute
on each of the seven known breaks · the divergence list for cash flow, load boards and
pre-settlements.
