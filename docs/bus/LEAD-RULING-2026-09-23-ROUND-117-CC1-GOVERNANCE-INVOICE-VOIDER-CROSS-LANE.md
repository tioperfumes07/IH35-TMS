# LEAD RULING 2026-09-23 — ROUND 117 — CC-1 cross into `apps/backend/src/governance/**` (UNASSIGNED lane)

**Authorization basis:** the Lead's own ROUND 117 message, verbatim, assigning this exact task to
CC-1 by name:

> Invoices 13541 and 13572 — voided, with a reason, NO voider. A column does not fix those.
> Find the write path that produced them and close it. Report the PATH, not the two rows.

**What crossed:** `apps/backend/src/governance/void-cancel-executors.ts` and its test file
(`void-cancel-executors.test.ts`) — `verify-lane-ownership.mjs` reports this path as
`UNASSIGNED` in `docs/bus/LANES.md` (no seat currently owns it, confirmed via grep — this is not a
cross into another active seat's in-flight work).

**The fix:** `executeInvoice`'s status-flip `UPDATE accounting.invoices` wrote `voided_at` and
`void_reason` but never `voided_by_user_id`, even though the real actor (`userId`) was already a
bound parameter in the same statement (used for the separate `updated_by_user_id` column). This is
the write path that produced 38 live USMCA invoices — including the two the Lead named — with a
real void reason and a null voider. Fixed by adding `voided_by_user_id = $4::uuid` to the same
`SET` clause, reusing the existing `$4` parameter. Full detail in PR #22424's own commit message.

Per the session's established pattern for an UNASSIGNED-lane cross under a direct Lead order: this
doc + `LANE_CROSS=LEAD-RULING-2026-09-23-ROUND-117-CC1-GOVERNANCE-INVOICE-VOIDER-CROSS-LANE.md` at
push + a matching `LANE-CROSS:` line in the PR body.
