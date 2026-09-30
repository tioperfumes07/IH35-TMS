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
