export default {
  name: "verify-insurance-recovery-capped-at-loss",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-insurance-recovery-capped-at-loss.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-insurance-recovery-capped-at-loss.mjs"]);
  },
};
