/**
 * ROUND E23 — wires scripts/verify-gate-live-reads-use-ci-readonly.mjs (Q06, the
 * ih35_ci_readonly connection guard) into CI. Static, no DATABASE_URL needed.
 */
export default {
  name: "verify-gate-live-reads-use-ci-readonly",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-gate-live-reads-use-ci-readonly.mjs"]);
  },
};
