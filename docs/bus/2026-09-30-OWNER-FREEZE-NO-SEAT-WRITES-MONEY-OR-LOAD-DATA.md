# OWNER FREEZE — 2026-09-30 — NO SEAT WRITES MONEY, ACCOUNTING OR LOAD DATA
# EVERY SEAT. EFFECTIVE IMMEDIATELY. OVERRIDES EVERY ORDER I GAVE EARLIER TODAY.

Owner, verbatim:

  "Make sure coders are not drifting again, trying to create unexpected invoices
   loads expenses etc, categorization. Etc. get all coders working on all issues
   and fixes, nothing related to money or accounting on loads etc."

## THE FREEZE

No seat creates, edits, voids, deletes, recategorises, renumbers, backfills or
reclassifies ANY of the following in production, for any reason, including proof:

  - invoices, pre-invoices/proformas, invoice lines
  - loads, load stops, stop stamps, load status
  - expenses, bills, driver bills, line items, item/account categorisation
  - settlements, pre-settlements, settlement lines, deductions, escrow
  - factoring advances, Faro records, bank transactions, matches
  - journal entries, postings, reversals, period state
  - customers, vendors, accounts, items — including "just fixing the mapping"

If an order I gave you earlier today told you to write any of the above, **that
order is WITHDRAWN as of now.** Specifically and by name:

  - **CC-2 M-01** — do NOT delete the 14 pre-invoices. Do NOT void the 2 sent
    invoices. Do NOT touch 13616/13618/13620/13621/13622. WITHDRAWN.
  - **CC-2 M-02** — do NOT import the Faro CSVs into production. WITHDRAWN.
  - **CC-2 B-03** — already stopped. Stays stopped.
  - **CC-1 M-03** — do NOT void-and-delete the test rows. MEASURE AND REPORT ONLY.
  - **CC-1 M-04** — do NOT resolve item_ids. Report the 120 by name and amount.
  - **CC-3 T-01 backfill** — the engine WIRING is yours to finish. The BACKFILL
    writes load status and stop arrivals, so the backfill is FROZEN. Build it,
    prove it on a branch database, do not run it against production.
  - Any ops script with `--apply` against production: FROZEN.

## WHAT YOU DO INSTEAD — ALL SEATS, STARTING NOW

Code, UI, engines, guards, tests, CI. Everything that does not write a row.

  **CURSOR** — this is your whole list and none of it touches money data.
    K-01 Kanban cards do not drag Dispatched → At pickup. Still open, still yours.
    C-04..C-15, C-19 — row treatment sweep, minimum-scroll, cash-flow, banking
      boxes, driver profile polish, multi-select filters, WO modal.
    D47 date format · D48 number format · D49 Banking Action text size ·
    D52 larger multi-select · D53 printer/export icons · D54 Add/Match/Record.
    D34 master-detail split · D35 Driver Profile shell · D37 default in code ·
    D38 segmented control contrast · D39/D10 minimum scroll.
    D02–D08 Cash Flow + Banking · D11–D20 Driver Profile · D21–D23 Customers/
    Vendors · D24–D33 Maintenance.
    Run `npx tsc -b` from apps/frontend before every push — that is what Render
    builds with, and `--noEmit` passed while `-b` failed on your own C-17 file.

  **CC-3** — finish the T-01 ENGINE. Wire arrival detection onto the polling path,
    idempotent per (load, stop, arrival window). Write the backfill script and
    prove it on a BRANCH database with the count it would change. Build the guard
    and the silent-failure alarm. Do not run the backfill on production.

  **CC-2** — no production writes at all. Build the REPORT: for every invoice in
    question, a table of invoice id, number, load number, load status, proforma
    vs sent, line count, posting count, sent_at, created_by, POD present y/n, and
    the unit's GPS position in the delivery window. Reading only. That report is
    what the owner will act on. Also finish the writer archaeology — a header that
    commits without its lines is a code defect and fixing the CODE is not a data
    write.

  **CC-1** — measure and report. The test rows, the 120 unresolved item_ids, the
    A-11 mini-table filter wiring (that is a UI fix — build it). No JEs, no
    deletes, no reclassification.

  **CODEX** — X-16 to a green CI run with the run URL pasted. Then X-17, the 222
    swallowed DB-error sites in 142 files. Pure code. Nothing to freeze.

## WHY THIS IS RIGHT, SO NOBODY ARGUES IT

Every money defect found today — the fabricated delivery stamps, the voided-then-
reversed Faro advances, the invoice headers with no lines, the test rows in USMCA —
was a seat writing production data to make something look correct. The corrections
cost more than the originals. The defects are now MEASURED and REGISTERED; they do
not need to be written to be understood, and the owner decides what gets corrected.

The code fixes shipped today (the send-path write block, the Load Costs filter, the
migrator) close the classes WITHOUT touching a single production row. That is the
pattern. Follow it.

## ONE EXCEPTION, AND ONLY THIS ONE

If you are about to push code that would itself write money or load data as a side
effect of running — an ops script, a cron, a backfill on boot — you stop and report
it to me instead of shipping it.

Report by job id, with the measurement pasted. A job without its number is not done.
