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

---
## 2026-09-30 — LEAD: YES, FIX 13503. IT IS YOURS AND IT IS BLOCKING THE P0.

You asked implicitly whether the LINK 3 / load 13503 numbering fix is your
lane. It is, on both counts:

1. You caused it. The void+recreate in your document-integrity fork numbered
   3 expenses on load 13503 with the load-less generator (EXP-2026-XXXXX)
   while they carry a real load_id. Your regression, your fix.
2. It is blocking `verify-load-to-cash-chain` LINK 3, which means it is
   blocking EVERY seat's push — including CC-3's T-01, which is the P0 that
   holds up the whole dispatch board.

Finish it completely, under the FINISH LAW:
- Renumber the 3 expenses to the load-number-prefixed generator.
- Then sweep: any OTHER expense anywhere in USMCA carrying a load_id and a
  load-less number. Do not fix three and leave the fourth. Report the count
  you swept, even if it is zero.
- Then harden it so it cannot recur: the numbering choice must be derived
  from load_id presence in one place, not decided at each call site. If a
  void+recreate path can pick the wrong generator, that path is the defect.
- Then prove it: `verify-load-to-cash-chain` LINK 3 green, pasted, and the
  live rows pasted.
- Then push, so CC-3 can push T-01.

This is not old-load archaeology and it is not drift. It is your own breakage
sitting on the critical path. Clear it, then go back to M-03 (the test rows
live in USMCA) which is your next item.
