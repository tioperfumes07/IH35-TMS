# ROUND 390.1 + 390.2 — CC-1 — as received 2026-10-03 (verbatim, pasted to CC-1 by the owner session)

Recorded on the bus so the lane cross for 390.1 (apps/backend/test-helpers/**, UNASSIGNED in LANES.md) cites a file.

---

CC-1 — ROUND 390.1 — E2E fixtures are in production USMCA and nothing is stopping the writer

MEASURED (prod read-only, bypass_rls='lucia', USMCA, 2026-10-03):
  customer  E2E Customer 2E-06daf76e   2026-10-02   is_sample_data=false
  customer  E2E Customer 2E-edd081e8   2026-10-02   is_sample_data=false
  customer  E2E Customer 2E-95603e75   2026-09-30   is_sample_data=false
  load      E2E-2E-95603e75            2026-09-30   is_sample_data=false

Four E2E fixtures in production. NONE carries is_sample_data, so by project law every one reads as a
REAL record. Two are new since 2026-10-02 — ongoing, not historical. Standing order: NOBODY SEEDS
ANY DATA ANYWHERE. verify-usmca-clean-no-voids-no-fixtures.mjs catches this and was an ORPHAN: no
workflow, no verify-step, never run. ROUND 389 wired 156 orphans; this one is EXEMPT BECAUSE IT FAILS.

ONE PR, IN THIS ORDER:
1. FIND THE WRITER. Grep `E2E Customer 2E-` / `E2E-2E-` in apps/ and scripts/, follow to the caller.
   Name the file:line. Read the source — do not guess.
2. STOP IT AT THE WRITER. Not a cleanup script. It must be unable to reach production USMCA.
3. REMOVE THE FOUR ROWS. REVERSE the GL → VOID the document → PURGE the row. Never hand-write a void.
   If any carries postings, say so with the posting ids BEFORE deleting.
4. REMOVE THE EXEMPTION from scripts/.guard-exempt.json and wire the guard
   (scripts/claim-verify-step.mjs --seat cc-1).

PR BODY: the writer's file:line quoted · live BEFORE/AFTER under bypass_rls='lucia' on the DIRECT
endpoint (a 0 from the pooler is MASKED) · the guard PASS line, wired, not exempt.
DEADLINE 2026-10-04 18:00Z. Missed → surface goes to CC-3.

---

CC-1 — ROUND 390.2 — arriving-soon stopped reading the real PM schedule

MEASURED 2026-10-03, verify-arriving-soon-serves-pm-and-wo-due.mjs:
  - arriving-soon.routes.ts no longer joins maintenance.pm_schedules
  - its PM join no longer excludes sample/test units (Round 303 T-37 law)

Orphan guard — never executed by CI — so the regression shipped unseen.

ONE PR: restore the pm_schedules join · restore the sample-unit exclusion · remove the entry from
scripts/.guard-exempt.json and wire it (--seat cc-1).
PR BODY: the guard PASS line pasted, plus a live arriving-soon row whose PM due date matches its
maintenance.pm_schedules row.
DEADLINE 2026-10-04 18:00Z. Missed → CC-3.
