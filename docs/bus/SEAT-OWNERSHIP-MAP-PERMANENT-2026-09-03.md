# Seat ownership map — permanent — 2026-09-03

```text

=========================================================================
OWNERSHIP MAP — PERMANENT. SUPERSEDES EVERY EARLIER ASSIGNMENT.
Issued 2026-09-03 by owner order. This file overrides every other file
in this folder where they disagree.
=========================================================================

THREE LAWS FOR ALL SIX SEATS
----------------------------
LAW 1 — NO SEAT OPENS CHROME. NO SEAT BOOKS A LOAD. NO SEAT CLICKS THE APP.
        The OWNER books the loads. The OWNER finds the defects. The owner
        reports them to orch. Orch routes each defect to the seat that OWNS
        that module. A seat that spends its turn driving the browser is a
        seat that built nothing that turn. If you were about to "verify in
        Chrome" — you were about to waste the owner's time. Verify with a
        guard script and a live Neon SELECT instead.

LAW 2 — ONE SEAT OWNS ONE MODULE, END TO END, INCLUDING ITS MONEY.
        The screen, the fields, the sizes, the validation, the API route,
        the service, the schema, the GL posting, the guard. You do not hand
        off the money half of your own module to another seat. You do not
        touch another seat's module. If your module needs something from
        another module, you FILE A FINDING to that owner — you do not go
        edit their file.

LAW 3 — NEVER IDLE. EVER.
        Every seat below has a STANDING QUEUE, in order. You finish an item,
        you open the next one the same turn. You do not stop and ask "what's
        next." You do not report "awaiting direction." The queue IS the
        direction. You only stop when your whole queue is empty, and then you
        audit your own module against McLeod / Alvys / QuickBooks and file
        the gaps as new queue items yourself.

THE MAP
-------
  CURSOR   ->  BOOK LOAD WIZARD              (whole thing + its money)
  CASCADE  ->  DISPATCH BOARD + ROUND TRIPS TIMELINE + all list/table views
  CC-1     ->  SETTLEMENTS / PRE-SETTLEMENTS / LOAD COSTS + MILEAGE ENGINE
  CC-2     ->  BANKING + ACCOUNTING (match, expenses, bills, invoices, GL, QBO)
  CC-3     ->  DRIVERS + COMPLIANCE (roster, licences, HOS, qualification)
  CODEX    ->  FLEET (units, trailers, maintenance, work orders, OOS)

NO OVERLAP. Read your own file in your own folder. Do not read another
seat's file to "help." Helping is how we got regressions.

BOUNDARY CASES, DECIDED — DO NOT RE-LITIGATE
--------------------------------------------
  * Mileage: CC-1 owns the engine and the lane table. Cursor CONSUMES it and
    owns how it renders in the wizard. Cursor never edits the engine.
  * Round trips: CC-1 owns the round-trip DATA and the money that rolls up
    into a settlement. Cascade owns the TIMELINE VIEW that draws it.
  * Load costs vs pre-settlement: same object. CC-1 owns both. There is one
    money spine: load costs -> pre-settlement -> settlement (closes on the SB).
  * Driver pay lines live in CC-1's settlement math. CC-3 owns whether the
    driver is QUALIFIED, not what he is PAID.
  * Bank rows are matched to expenses/bills the OWNER creates from a load.
    CC-2 owns the match. CC-1 owns the expense's attribution to unit/load.

FILING A FINDING TO ANOTHER SEAT
--------------------------------
  One line in docs/bus/findings/, addressed to the owning seat:
  TO: <seat> | FILE: <path:line> | WHAT IS WRONG | WHAT IT SHOULD DO | EVIDENCE
  Then keep building your own queue. Do not wait for them.

STANDING RULES, UNCHANGED
-------------------------
  * USMCA only: 5c854333-6ea5-4faa-af31-67cb272fef80.
    TRANSPORTATION and TRUCKING are FROZEN — do not read, write or report.
  * Every read wraps:
      WITH b AS (SELECT set_config('app.bypass_rls','lucia',false))
      SELECT ... FROM b, <table>
  * Run every count TWICE. A bare 0 is MASKED until proven EMPTY.
  * Never write test, sample or demo rows into USMCA. Not even for proof.
  * Money is integer cents. Every GL write goes through journal-entries.service.
  * "Merged" is not "the owner can use it." Report the DEPLOYED commit, not
    the merged one.
  * Fix the root cause. No patches. No deferrals.
```
