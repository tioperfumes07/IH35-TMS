export default {
  name: "verify-load-costs-tab-advance-received-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-costs-tab-advance-received-wired.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-load-costs-tab-advance-received-wired.mjs"]);
  },
};
