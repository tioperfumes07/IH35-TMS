# ROUND 255 — CURSOR — THE TRUCK LINE BOARD, BUILT AS ASKED, PLUS RESPONSIVE WIDTH

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

## ITEM 1 — THE LINKAGE DEFECT. P0.
MEASURED LIVE, USMCA `mdata.loads`: closed 86 · invoiced 23 · **dispatched 14** · completed_docs_received 13
· cancelled 13 = 149. The board shows **11**. The owner counts **16** actually running.
Three answers to one question. Before you change a pixel: paste the board's query, NAME why it returns
11 instead of 14, and identify the owner's 2 extra loads. **A truck physically running and not in the
app is the most serious finding on this board.** Then make the truck line, dispatch and tour views all
resolve from ONE canonical active-load definition. If each has its own status list, that is the root
cause and it gets fixed once, centrally.

## ITEM 2 — A UNIT MAY APPEAR TWICE. THAT IS CORRECT.
Owner ruling: when a second row's PU date equals the first row's DELIVERY date, that is the RETURN
TRIP — the truck is already booked home. Do NOT de-duplicate, do NOT collapse, do NOT flag it.
Render both, with the second visually chained to the first.
The unit after **176** renders with no unit shown — same grouping logic swallowing a row. Fix and name
the cause.

## ITEM 3 — COLUMN ORDER, EXACTLY
`UNIT · PRE-SETTLEMENT / TOUR NUMBER · LOAD NUMBER · PU DATE · DELIVERY DATE · [ TRANSIT LINE ]`
The transit line BEGINS under the LOAD column. Not before it, not at the row's left edge.

## ITEM 4 — THE TRANSIT LINE REGRESSED. RESTORE IT.
The truck was **GREEN**. It **ANIMATED along the line throwing smoke**. The line was **CENTRED**. The
truck was **DRAGGABLE** and dragging changed status `in transit → on time → at delivery → delivered`,
writing who changed it and when. **CURRENT LOCATION** rendered after the line.
Find the commit where this worked and diff against it. Do not reinvent — reinventing is how the smoke
was lost.

## ITEM 5 — ROW HEIGHT
Too tall. Tighten to the height of the tallest real element. Target: the full active fleet visible
without scrolling on a standard laptop.

## ITEM 6 — PER-LOAD STATUS DROPDOWN
Clicking the current status opens a dropdown **under that load's row**, in place. Not a modal, not a
side panel, not a navigation.

## ITEM 7 — THE UNIVERSAL DROPDOWN COMBO FILTER BOX
ONE control filtering unit, driver, customer, status, tour / pre-settlement number and date range
together. Typing narrows across all of them at once. Requested repeatedly, still absent.

## ITEM 8 — RESPONSIVE WIDTH, GLOBAL
Pages do not reflow when the window is not maximised. No horizontal page scroll at ANY width; tables
get their own `overflow-x: auto` container instead of pushing the page wider; text wraps instead of
clipping; layout reflows rather than requiring a maximised window. Fix dispatch first, then sweep
every page you own and REPORT which pages outside your lane still fail so they can be routed.

## LINKAGE — the board is not a view, it is a chain
load ↔ unit ↔ driver ↔ trailer ↔ customer ↔ stops (with coordinates) ↔ tour / pre-settlement ↔
invoice ↔ settlement ↔ `docs.files`. Every row on the board must resolve all of it, both directions.

## GUARD
`verify-truck-line-board-shows-canonical-active-set.mjs` — REQUIRES_LIVE_DB. Board row count equals
the canonical active-load count. Column order asserted. A unit with a return trip renders TWO rows.

## PROOF REQUIRED
The board query and the named reason for 11 vs 14 · what the owner's 2 extra loads are · a live URL
or screenshot showing the column order, the green animated truck on a centred line, a return trip as
two chained rows, the per-load dropdown open, and the universal filter · the board at a
non-maximised width with no horizontal scroll · the guard passing.
