// 2746-verify-orphan-surface-drill — CLS-ORPHAN-SURFACE. A nav/leaf that drills through to detail (bill
// row + back button, Chart-of-Accounts reachability + alphabetized More overflow, cash-flow 7-day
// strip drill-through) must not silently lose its wiring. See scripts/verify-orphan-surface-drill.mjs
// for the mutation-proven regex checks and docs/audit/wave-queue.json#CLS-ORPHAN-SURFACE for the
// live-verification history (ORPH-001/002/004 resolved 2026-08-05/06; ORPH-003 ACH gap and ORPH-005
// empty-state correlation are non-code remainders tracked separately, not covered by this guard).
export default {
  name: "verify:orphan-surface-drill",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-orphan-surface-drill.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-orphan-surface-drill.mjs"]);
  },
};
