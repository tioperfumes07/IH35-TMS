export default {
  name: "verify-acct-txn-register-detail-paths",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-txn-register-detail-paths.mjs"]);
  },
};
