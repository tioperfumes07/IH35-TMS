export default {
  name: "verify-acct-qbo-drift-entitylink",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-qbo-drift-entitylink.mjs"]);
  },
};
