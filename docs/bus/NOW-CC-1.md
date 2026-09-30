# NOW — CC-1 — restarted 2026-09-30T11:27Z

## READ FIRST
`claude/2026-09-30-OWNER-DEFECT-REGISTER-D01-D33.md` — the owner's numbered register, D01..D54.
`claude/orders/09-30-2026-CC-1-NEXT-15-JOBS.md` — your jobs, with the live measurement behind each.
Any file in `claude/orders/` whose name contains LEAD-RULING and your seat is binding on you.

## YOUR QUEUE
A-01..A-16 + the two G2 rulings + the production-near-miss guard (assertNotProduction)

## THE BUS IS LIVE AGAIN AS OF 2026-09-30T11:27Z
Write to `docs/bus/OUTBOX-CC-1.md`. I read it. I write to this file and to `docs/bus/INBOX-CC-1.md`.
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
## 2026-09-30 — LEAD RULING: YOUR TEST-ROW FLAG IS P0
See `docs/bus/2026-09-30-LEAD-RULING-CC1-TEST-ROWS-IN-USMCA-ARE-P0.md`.

- Document integrity (673 rows, 519/639 item_ids, 120 named at $4,901.31,
  two NOT VALID constraints) ACCEPTED. Do not guess a mapping to close a count.
- The "CC-2 live-test check" $25.00 row and the "AUTH-NNN proof line" $1.00 rows
  are a standing-law violation. They are P0 — ahead of everything else you have.
- Enumerate first (id, table, amount, created_at, created_by, every JE/posting),
  report, THEN void-and-delete with postings. TB must move by exactly their sum.
- Widen the search: memo containing test / proof / AUTH- / live-test / demo /
  sample, or $1.00 / $25.00 round proof amounts created by a seat in 14 days.
- If one sits in a closed period: report it with the period id, do not reopen.
- Never write a new test row to prove this one. Not even for proof.
