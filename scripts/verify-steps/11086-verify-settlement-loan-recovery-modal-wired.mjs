export default {
  name: "verify-settlement-loan-recovery-modal-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlement-loan-recovery-modal-wired.mjs"]);
  },
};
