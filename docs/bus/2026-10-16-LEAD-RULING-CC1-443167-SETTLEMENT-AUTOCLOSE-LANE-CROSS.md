# OWNER RULING — 2026-10-16 — CC-1 CROSSES INTO DRIVER-FINANCE SETTLEMENT SERVICE (443.167)
Recorded by CC-1 · authority: owner, chat 2026-10-16 ("LEAD ROUND 443.167-Updated (OWNER RULING)") ·
basis: law §2 (settlement closing is human-confirmed only), ROUND 443.167-Updated OWNER RULING —
settlement auto-close on delivered_pending_docs is a financial integrity defect CC-1 owns.

**Cite this filename in `LANE_CROSS=` and in the PR body.**

## What is crossed, and why it cannot be split

The auto-close block is inside the CC-3-owned settlement service. The financial law violation (§2:
settlement closing is never automatic) is CC-1's domain. The fix is one atomic removal; splitting it
would leave the law violation in place while the guard (`verify-settlement-no-dispatch-autoclose.mjs`)
ships — that creates a CI-red state.

| File | Owner (LANES.md) | Change |
|---|---|---|
| `apps/backend/src/driver-finance/settlements-load-bookended.service.ts` | CC-3 | remove auto-close block on delivered_pending_docs; add reopenSeedClosedSettlement engine function |
| `apps/backend/src/driver-finance/settlement-payment.routes.ts` | CC-3 | add POST reopen-seed-closed route (Owner/Admin only) for seed reversal |
| `scripts/seed-cc1-443167-reverse-seed-closes.ts` | UNASSIGNED | reversal seed — void 19+5 seed-closed settlements |
| `scripts/seed-cc1-443167-fix-dispatched.ts` | UNASSIGNED | reversal seed — reset 6 loads to dispatched |
| `scripts/seed-cc1-443167-settle-stops.ts` | UNASSIGNED | reversal seed — settle pending stops on delivered/invoiced loads |
