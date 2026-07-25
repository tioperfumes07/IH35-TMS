export default {
  name: "verify-acct-surf-08-period-audit",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-surf-08-period-audit.mjs"]);
  },
};
