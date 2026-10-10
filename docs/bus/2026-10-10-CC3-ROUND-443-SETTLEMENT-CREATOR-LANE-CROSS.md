# LANE_CROSS: CC-3, ROUND 443.2 to 443.7, Settlement Creator engine (2026-10-10)

**Lead order:** "CC-3 — ROUND 443.2 to 443.7 — SETTLEMENT CREATOR ENGINE: PERMANENT FIX (driver-finance/** + Creator frontend)". Issued 2026-10-10 19:50 UTC by Claude Lead.

The order also says: "One PR + one named guard per step, guard wired in scripts/verify-steps/ in the same PR".

**Files:** `apps/backend/src/driver-finance/**`, `apps/frontend/src/pages/settlements/**`, `apps/frontend/src/api/settlementCreator.ts`. Not `accounting/**` (CC-1), not `dispatch/**` (CC-2), not `banking/**` (Cursor).

**Crossing:** the lane registry assigns the `scripts/verify-settlement-creator-*.mjs` guards and the existing Settlement Creator verify-step `scripts/verify-steps/14821-*.mjs` to CC-1.
- Each 443.x guard is new and lives beside its siblings.
- Each is wired into step 14821 instead of a new step number, so no claim is needed.
- No CC-1 guard's rule is weakened.

**CC-1:** nothing to do. This note is the record of the crossing for every 443.x PR.
