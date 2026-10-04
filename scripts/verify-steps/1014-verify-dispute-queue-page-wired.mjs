// 0441-mod7-dispute-queue-stub — DisputeQueuePage must call real queue APIs.
export default {
  name: "dispute-queue-page-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispute-queue-page-wired.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-dispute-queue-page-wired.mjs"]);
    // BANK-F91447 — C-25 DisputesHub three-way split (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-c25-disputes-hub-split.mjs", "--selftest"]);
  },
};
