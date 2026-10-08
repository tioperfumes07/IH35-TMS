// verify-steps wrapper — LV-DEAD-SEEDED-FLAGS · claim 3630
export default {
  name: "verify-dead-seeded-flags-archived",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dead-seeded-flags-archived.mjs"]);
    await ctx.run("node", ["scripts/verify-91056-factor-submit-tab-queue-slate-leftover-chrome.mjs"]);
  },
};
