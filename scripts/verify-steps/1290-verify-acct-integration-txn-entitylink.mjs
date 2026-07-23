export default {
  name: "verify-acct-integration-txn-entitylink",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-integration-txn-entitylink.mjs"]);
  },
};
