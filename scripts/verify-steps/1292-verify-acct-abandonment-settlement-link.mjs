export default {
  name: "verify-acct-abandonment-settlement-link",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-abandonment-settlement-link.mjs"]);
  },
};
