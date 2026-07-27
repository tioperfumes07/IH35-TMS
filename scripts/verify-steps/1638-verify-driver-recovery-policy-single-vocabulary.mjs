/** Driver recovery policy speaks ONE rail vocabulary — the owner-locked one, derived not pinned. */
export default {
  name: "verify-driver-recovery-policy-single-vocabulary",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-recovery-policy-single-vocabulary.mjs"]);
    await ctx.run("node", ["scripts/verify-driver-recovery-policy-single-vocabulary.mjs", "--selftest"]);
  },
};
