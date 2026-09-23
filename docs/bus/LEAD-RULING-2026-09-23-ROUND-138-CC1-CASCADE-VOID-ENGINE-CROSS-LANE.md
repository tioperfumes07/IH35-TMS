# LEAD RULING 2026-09-23 — ROUND 138 — CC-1 cross into `apps/backend/src/governance/**` and `apps/backend/src/work-orders/**` (both UNASSIGNED lane)

**Authorization basis:** the owner's own direct instruction this round, verbatim:

> Build the cascade void engine. This is void-not-delete, so nothing blocks you on it... WIRE IT
> EVERYWHERE (dispatcher cancellation, admin void, E10 runner, governance executor — "No caller
> gets to void a parent on its own anymore")... Build it so the next cancel is correct without
> anyone checking.

Both crossed files are void-write call sites that needed the new `cascadeVoidChildren` wired in
directly — neither is a file this ruling invents scope for; both were located by a full-repo grep
for every existing writer of a `voided_at`/`status='void'` signal against the five parent tables
this round's cascade engine registers, per the instruction's own "every caller" requirement.

**What crossed, and why each specific file:**

1. `apps/backend/src/governance/void-cancel-executors.ts` — `verify-lane-ownership.mjs` reports
   this path `UNASSIGNED` in `docs/bus/LANES.md`. Already crossed twice before this session under
   two separate ROUND 117 and ROUND 125-128 rulings (see
   `docs/bus/LEAD-RULING-2026-09-23-ROUND-128-CC1-GOVERNANCE-FUEL-EXECUTOR-CROSS-LANE.md`); this is
   a third, separate touch, its own ruling doc per the session's own convention of one doc per
   distinct crossing reason. This round's touch: `executeBill`, `executeInvoice`, `executeExpense`,
   and `executeDriverSettlement` each write their own parent's void column directly (none of the
   four route through `stampDocumentVoided`, confirmed by reading each function before wiring) —
   `cascadeVoidChildren(...)` added to each, right after its own status-flip UPDATE succeeds.

2. `apps/backend/src/work-orders/work-orders.routes.ts` — also `UNASSIGNED` in `docs/bus/LANES.md`,
   first CC-1 touch. This file's WO-close cascade voids linked `accounting.bills` and
   `accounting.expenses` directly (its own raw `UPDATE`, not through any shared executor) —
   `cascadeVoidChildren(...)` added after both writes, same shape as every other call site this
   round.

**The fix:** full detail in this round's own commit message (FINDING ACCT-F2026092330) — the new
`apps/backend/src/accounting/cascade-void-engine.service.ts` primitive, wired into 11 files total
across `accounting/`, `dispatch/`, `governance/`, and `work-orders/`; live-backfilled 119
`invoice_lines` + 28 `bill_lines` found orphaned under already-voided parents; two new guards
(`verify-void-cascades-to-every-child.mjs`, `verify-no-caller-voids-without-cascade.mjs`) wired
into `scripts/money-pr-local-gate.mjs`.

Per the session's established pattern for an UNASSIGNED-lane cross under a direct owner
instruction: this ruling doc is itself the record: `LANE_CROSS=LEAD-RULING-2026-09-23-ROUND-138-CC1-CASCADE-VOID-ENGINE-CROSS-LANE.md`
passed to `verify-lane-ownership.mjs`, and `LANE-CROSS: LEAD-RULING-2026-09-23-ROUND-138-CC1-CASCADE-VOID-ENGINE-CROSS-LANE.md`
in the PR body, per that guard's own required format.
