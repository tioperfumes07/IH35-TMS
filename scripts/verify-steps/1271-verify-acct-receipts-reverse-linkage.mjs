export default {
  name: "verify-acct-receipts-reverse-linkage",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-receipts-reverse-linkage.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-acct-receipts-reverse-linkage.mjs"]);
  },
};
