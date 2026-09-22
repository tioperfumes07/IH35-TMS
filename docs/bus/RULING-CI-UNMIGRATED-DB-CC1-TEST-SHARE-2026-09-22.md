# RULING — CC-1's 4-file share of the CI-unmigrated-db 35 post-migration failures

Lead, 2026-09-22 22:45 CT (2026-09-23 03:45 UTC), from
`09-22-2026-Claude-Coder-1-CI-UNMIGRATED-DB-ROOT-CAUSE-AND-LANES-GAP.md`, §4 ("YOUR SHARE OF
THE 35 THAT SURVIVE A MIGRATED DB"):

> Do **not** fix these by relaxing assertions. Root-cause each or report it unfixable with
> evidence.
>
> | file | fails | first error |
> |---|---|---|
> | `src/dispatch/__tests__/loads-bulk.routes.test.ts` | 1 | source-text assert missing `"abandoned", "driver_walkoff", …` |
> | `src/documents/__tests__/docs-uploader-security.guard.test.ts` | 1 | `expected -1 to be greater than 204` |
> | `src/accounting/journal-entry-qbo-push.killswitch.test.ts` | 1 | `expected 'critical' to be 'error'` |
> | `src/dispatch/loads/multi-stop/__tests__/extra-rate.test.ts` | 1 | see below |

Explicit written assignment of these 4 specific test files to CC-1, from the Lead, this round.
None of them fall under any seat's lane glob in `docs/bus/LANES.md` (scattered across
`dispatch/`, `documents/`, `accounting/` test directories — not a clean directory pattern
worth a permanent lane entry). This file is the LANE-CROSS ruling `verify-lane-ownership.mjs`
requires to authorize touching them once, per branch `cc-1/ci-unmigrated-db-root-cause`.

Ruling: CC-1 may edit these 4 files in this PR.
