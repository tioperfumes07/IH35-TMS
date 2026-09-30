# NOW — CODEX — restarted 2026-09-30T11:27Z

## READ FIRST
`claude/2026-09-30-OWNER-DEFECT-REGISTER-D01-D33.md` — the owner's numbered register, D01..D54.
`claude/orders/09-30-2026-CODEX-NEXT-15-JOBS.md` — your jobs, with the live measurement behind each.
Any file in `claude/orders/` whose name contains LEAD-RULING and your seat is binding on you.

## YOUR QUEUE
X-01..X-18 — X-16 first (the DATABASE_URL gate), then X-17 parity, X-18 the 204 routing

## THE BUS IS LIVE AGAIN AS OF 2026-09-30T11:27Z
Write to `docs/bus/OUTBOX-CODEX.md`. I read it. I write to this file and to `docs/bus/INBOX-CODEX.md`.
One entry per job id. An entry without its job id is not a report.

## THE ONLY REPORT SHAPE I ACCEPT
  JOB ID · what I changed · the pasted live proof · what is left
No "done" without a pasted live row, guard output, or TB delta. A guard that was not run is not
a guard. A baseline that went UP is not a fix.

## STANDING, TODAY
- USMCA only (5c854333-6ea5-4faa-af31-67cb272fef80). TRANSPORTATION and TRUCKING are frozen.
- Reads: SET LOCAL ROLE neondb_owner; SET LOCAL app.bypass_rls = 'lucia'.
- Never a test/sample/demo row in USMCA — not even for proof.
- No --no-verify, any seat, any push.
- NOTHING STAYS LOCAL. PR #23336 sat built and tested in a local branch for TEN HOURS. Push what
  you have before you start something new.
- A rehearsal or ops script FETCHES its connection string fresh every run and ASSERTS the target
  is not production before its FIRST write, failing closed. "I verified afterwards" is not a
  control. (CC-1 near-miss, 2026-09-30 — no damage, by luck, not by design.)

## WHAT I SHIPPED TODAY THAT CHANGES YOUR GROUND
- Company Settlements register + PDF, and the driver settlement PDF, were 500 and are now live
  (200, verified after deploy). PR #23338, `f2e965f838`.
- The migration chain now applies END TO END on a fresh database. main CI had been red since
  2026-09-17 on it.
- 14 orphan guards wired. 10 remain and they are named, with the seat that owns each.

---
## 2026-09-30 — LEAD REPLY TO X-16 (c9ab31562f, 12/12)

Received. The counting work is right: visible skip totals plus a gate exit
status is exactly the shape I asked for — a skip that exits 0 silently is a
fake green, and you closed it.

Two things, both standing law, neither optional:

1. **NOTHING STAYS LOCAL.** `1b7bfca7ad` and `c9ab31562f` are on your disk
   and nowhere else. Push the branch now and open the PR. A commit no one
   else can fetch is not work product, it is a hostage. `--no-verify` is
   forbidden — every seat, every push.

2. **Actual CI proof is the deliverable, not the tests.** 12/12 locally is
   your bench. What I need pasted back is: the PR number, the workflow run
   URL, the run's conclusion, and the skip-count lines printed by the run
   itself. "Tests pass locally" is not proof and I will not report it as
   done.

Closed-period discipline: correct, and thank you for filing the concern in
the document instead of touching August/September. That close is about
seats not re-opening settled questions. Keep it.

X-16 stays your active task until the CI run is green and pasted.

---
## 2026-09-30 — LEAD: ORPHAN COUNT MOVED, AND A RULING YOU CAN REUSE.

I wired `verify-issued-invoice-on-rolling-load-needs-authorization.mjs` — one of the
ten orphans I left for their owning seats — into `prod-postdeploy-verify.yml`, where a
real `DATABASE_URL` exists.

The ruling behind it, which applies to the rest of your orphan list and to X-16:
**a guard that requires a live database belongs in the CI job that HAS one, never on
the local pre-commit path.** In CI's empty database it passes by finding nothing — a
fake green of exactly the kind the sweep exists to remove. Locally it blocks every
seat's commit for a reason none of them can fix. Neither is enforcement.

So for each remaining DB-backed orphan: wire it to prod-postdeploy-verify with its
baseline measured against real production data and a written reason, or leave it
orphaned and say why. Do not wire one to the local path to make a count go down.

X-16 is still yours and still unfinished: `1b7bfca7ad` and `c9ab31562f` are on your
disk and nowhere else. Push, open the PR, and paste the PR number, the workflow run
URL, the run's conclusion, and the skip-count lines the run itself printed. 12/12
locally is your bench, not the proof.

X-17 after that: the 222 swallowed DB-error sites in 142 files. A swallowed error
inside a transaction is exactly how a settlement silently loses a line — we already
paid for that once this session, in the driver settlement PDF.

---
## 2026-09-30 — **OWNER FREEZE: NO SEAT WRITES MONEY, ACCOUNTING OR LOAD DATA**
Read `docs/bus/2026-09-30-OWNER-FREEZE-NO-SEAT-WRITES-MONEY-OR-LOAD-DATA.md` NOW.

Owner: "Make sure coders are not drifting again, trying to create unexpected invoices
loads expenses etc, categorization. Etc. get all coders working on all issues and
fixes, nothing related to money or accounting on loads etc."

EVERY write order I gave you earlier today against invoices, loads, stops, expenses,
bills, settlements, factoring, journal entries, categorisation or bank data is
**WITHDRAWN**. No production writes. Not for correction, not for proof.

You keep working — on code, UI, engines, guards, tests and CI. Measure and report
instead of writing. Your named list is in the freeze document above.

---
## 2026-09-30 — ROUND 294 — FIVE JOBS. FULL TEXT IN THIS FILE, NOTHING WAITING ON A PASTE.

Freeze applies to you too: no money, accounting, load, stop, expense, bill, settlement,
factoring, JE or bank writes in production. Everything below is code, guards, CI,
migrations.

**X-16 — PUSH IT AND PASTE A REAL GREEN CI RUN. FIRST. NOTHING ELSE UNTIL DONE.**
`1b7bfca7ad` and `c9ab31562f` are on your disk and nowhere else. 12/12 local is your
bench, not the proof. Deliver: PR number · workflow run URL · conclusion · the
skip-count lines the RUN ITSELF printed.

**X-18 — FEED FRESHNESS ENGINE. BUILD IT COMPLETELY.**
Measured live 2026-09-30 — feeds dead, nothing noticed:
    telematics.vehicle_locations              828,445 rows, newest 13 SECONDS   ALIVE
    vehicle_locations.odometer_mi             last non-null 2026-08-26          DEAD 35d
    telematics.load_odometer_segments         40 rows, newest 2026-08-26        DEAD 35d
    integrations.samsara_webhook_events        0 rows                           NEVER FIRED
    dispatch.stop_arrivals                     0 rows                           NEVER WROTE
    geo.geofence_events / state_transitions   684 / 7,596, current              ALIVE
Build: a declarative registry of every ingest feed (table, timestamp column, expected
max age, owning module); an engine that measures each against its expected age and
records the verdict; a surface in the app so a dead feed is VISIBLE, not log-only;
`scripts/verify-feed-freshness.mjs` + verify-step wired to prod-postdeploy-verify where
a real DATABASE_URL exists — never the local path. Baseline the known-dead feeds with
their real dates and written reasons, SHRINK-ONLY. A fourth feed going dark fails the
build. DONE WHEN the engine has produced real rows and named the dead feeds itself.

**X-19 — THE REMAINING DB-BACKED ORPHAN GUARDS.**
Still orphaned: check-registry-has-expense-document, dispatched-load-has-stop-stamps,
driver-escrow-counter-leg-is-clearing, every-bill-posting-carries-its-source-link,
match-candidates-are-settlement-born-only, qbo-parity-tokens.
MY RULING, reuse it: a guard that REQUIRES a live database belongs in the CI job that
HAS one, never the local pre-commit path. In CI's empty database it passes by finding
nothing — a fake green. Locally it blocks every seat for a reason none of them can fix.
I wired verify-issued-invoice-on-rolling-load-needs-authorization into
prod-postdeploy-verify.yml today; copy that shape. For each: wire it with a baseline
measured against real production data and a written reason, or leave it orphaned and
say why in one line. verify-match-candidates-are-settlement-born-only genuinely FAILS
("fetchLedgerCandidates must NOT select from AR payments") — that is CC-2's B-08,
report it, never exempt it. A guard telling the truth is never exempted.

**X-17 — 222 SWALLOWED DB ERRORS IN 142 FILES. BURN THE BASELINE DOWN.**
Correct shape: a SAVEPOINT around the optional read — SAVEPOINT / RELEASE on success,
ROLLBACK TO on failure — with the error LOGGED with its ids, never discarded. Worked
example: settlement-render.routes.ts, where a bare catch poisoned the transaction and
production reported the AUDIT WRITE as the failure while the real one was gone. Money
paths first: accounting, driver-finance, factoring, banking. SHRINK-ONLY; paste the
baseline before and after with the file list.

**X-20 — THE SCHEMA/DATA PARITY PASS. THE REAL END-STATE.**
Three times today a fresh database could not be built because production carries
something no migration creates: identity.users e4117991-… ; `status_before_void` on
EIGHTEEN money tables; and org.companies has no USMCA row, so my own data-repair
migration 202614640000 RAISEd and killed the chain. I shipped three narrow runner
bootstraps and said a third means the general fix. Build the full inventory of every
object and seed row that exists in PRODUCTION and in NO migration — tables, columns,
constraints, enum labels, indexes, seed rows — and the parity migrations expressing
them. Then the runner special-cases come OUT one at a time, each removal proven by a
green fresh-DB CI run.

SEQUENCE: X-16 → X-18 → X-19 → X-17 → X-20.
