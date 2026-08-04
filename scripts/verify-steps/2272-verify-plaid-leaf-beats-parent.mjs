export default {
  name: "verify-plaid-leaf-beats-parent",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-plaid-leaf-beats-parent.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-plaid-leaf-beats-parent.mjs"]);
  },
};
