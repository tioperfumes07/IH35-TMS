// verify-money-side-effect-after-commit — CLS-MONEY-PRECOMMIT-SIDE-EFFECT / LV-REVREC-NOT-FIRING.
// A GL poster that opens its OWN connection (withLuciaBypass) cannot see the caller's uncommitted
// rows under READ COMMITTED, so awaiting one inline from inside an open transaction makes its
// evidence gates read stale rows and post NOTHING — silently, because a gate is a return value, not
// a throw. Revenue recognition was dark for every load. This asserts the ordering is structural: the
// after-commit queue is wired into BOTH transaction wrappers, drained only on COMMIT, and truncated
// by ROLLBACK TO SAVEPOINT. Selftest first — it plants the real defect and demands RED.
export default {
  name: "verify:money-side-effect-after-commit",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-money-side-effect-after-commit.mjs"]);
  },
};
