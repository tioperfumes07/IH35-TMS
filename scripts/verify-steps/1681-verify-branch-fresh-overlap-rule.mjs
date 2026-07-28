/**
 * The branch-freshness gate is REQUIRED on main, so its rule must be provably correct:
 * too strict and every unrelated PR needs a pointless rebase (N open PRs = N^2 CI rebuilds);
 * too loose and CI validates a combination that will never ship.
 */
export default {
  name: "verify-branch-fresh-overlap-rule",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-branch-fresh-selftest.mjs"]);
  },
};
