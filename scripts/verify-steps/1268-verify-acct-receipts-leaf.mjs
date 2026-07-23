export default {
  name: "verify-acct-receipts-leaf",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-receipts-leaf.mjs"]);
  },
};
