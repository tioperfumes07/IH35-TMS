/** FLT-01 — fixed-asset monthly depreciation cron is registered, gated, logged, and sample-safe. */
export default {
  name: "verify-depreciation-autopost-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-depreciation-autopost-wired.mjs"]);
  },
};
