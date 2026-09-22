# RULING — CC-1's 4-file share of the CI-unmigrated-db 35 post-migration failures

Lead, 2026-09-22 22:45 CT (2026-09-23 03:45 UTC), from
`09-22-2026-Claude-Coder-1-CI-UNMIGRATED-DB-ROOT-CAUSE-AND-LANES-GAP.md`, §4 ("YOUR SHARE OF
THE 35 THAT SURVIVE A MIGRATED DB"), reconfirmed in the 2026-09-22 23:45 CT ROUND 30.6 follow-up
(§5, item 3):

> Your 4 backend test failures — `loads-bulk.routes`, `docs-uploader-security.guard`,
> `journal-entry-qbo-push.killswitch`, `extra-rate`. Root-cause each; **relax no assertion.**

Explicit written assignment of these 4 specific test files to CC-1, from the Lead. None of them
fall under any seat's lane glob in `docs/bus/LANES.md` (scattered across `dispatch/`,
`documents/`, `accounting/` test directories — not a clean directory pattern worth a permanent
lane entry, and unrelated to the Lead's own `.github/workflows/**` / `## LEAD` fix in #22168).
This file is the LANE-CROSS ruling `verify-lane-ownership.mjs` requires to authorize touching
them once, per branch `cc-1/round30-6-test-fixes-and-guard-wiring`.

Ruling: CC-1 may edit these 4 files in this PR.
