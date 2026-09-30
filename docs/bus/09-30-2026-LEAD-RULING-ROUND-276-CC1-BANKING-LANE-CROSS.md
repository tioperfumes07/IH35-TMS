# LEAD RULING — ROUND 276 bulk-accept, CC-1 crosses into CC-2's `apps/backend/src/banking/**` lane

2026-09-30. `apps/backend/src/banking/link-suggestion-engine.ts`,
`apps/backend/src/banking/link-suggestion-engine.test.ts`, and
`apps/backend/src/banking/link-suggestions-actions.routes.ts` are CC-2's lane per `docs/bus/LANES.md`
("CC-2 — money in and out", `apps/backend/src/banking/**`). ROUND 276 (bulk accept on the existing
link-suggestion engine, plus the owner's exact-match pre-tick rule: "only 100% identical matches
(amount, date, payee) may be pre-ticked") was assigned directly and repeatedly to CC-1 by name —
"CC-1 ROUND 276", "ROUND 276 BULK ACCEPT IS YOUR TOP PRIORITY" — not routed through CC-2, and the
work is a narrow, additive extension of a PR-2/link-suggestions surface CC-1 already built earlier
in this same chain (LOAD-TO-CASH CHAIN, LINK 4). Splitting an owner-assigned, single continuous
build across two seats mid-stream would recreate exactly the "one job, two seats" problem the
LANES.md file's own prior corrections (dispatch surface, cron file, void-cancel-executors) already
document and were ruled against.

**RULING: CC-1 may land this PR under `LANE-CROSS: 09-30-2026-LEAD-RULING-ROUND-276-CC1-BANKING-LANE-CROSS.md`.**
Scope is narrow and named: exactly the three files above, plus `scripts/verify-no-automatch.mjs`
(already CC-1's own lane, not a cross). No other file under `apps/backend/src/banking/**` is
touched. Owner may reassign the banking/link-suggestions surface to CC-2 going forward; until then
it continues as CC-1's, per the same "assigned work stays with whoever the owner names, until told
otherwise" reasoning already established in this file's prior grants.
