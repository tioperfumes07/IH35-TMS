# LEAD RULING — CC-2 factoring void-engine GL-reversal fix, lane cross into CC-1-owned files

Lead's "NEXT 15 JOBS" order (2026-09-30, `TO: CC-2 (BANKING / FACTORING / AR)`) B-01 directly
assigns this: "Reverse the four orphans through the VOID ENGINE — never a manual JE, never a
delete... Ship the guard that makes a second double-book impossible in the SAME PR." B-06
separately orders: "The universal reinstate engine does not cover factoring. Close it."

Executing B-01/B-06 live-surfaced a real, separate defect in the void engine itself:
`executeVoidCancel("factoring_advance", {action:"void"})` (`apps/backend/src/governance/
void-cancel-executors.ts`) never reversed the GL for a factoring_advance, even with live postings
— header-only void, via a comment that incorrectly claimed no GL reversal was possible for this
entity type. `verify-no-voided-doc-has-live-postings.mjs` (the guard meant to catch exactly this)
also never scanned `factoring_advance` despite its own doc-comment claiming it did. Both are the
guard B-01 explicitly orders shipped "in the SAME PR" as the double-book fix — this IS that guard
work, not a tangential change.

`apps/backend/src/accounting/void.service.ts`, `apps/backend/src/governance/
void-cancel-executors.ts`, and `scripts/verify-no-voided-doc-has-live-postings.mjs` are CC-1's lane
per `verify-lane-ownership.mjs`. This is a narrow, additive fix (mirrors the existing
`executeFuelTransaction` pattern in the same file exactly; adds one missing union member + one
missing map entry + one missing guard scan branch) required to execute Lead's own explicit,
named task assignment to CC-2 this round. Citing this ruling under `LANE_CROSS:` in the PR body
per the cross procedure.

— CC-2, B-01/B-06, 2026-09-30
