export default {
  name: "verify-acct-multi-bills-parity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-multi-bills-parity.mjs"]);
  },
};
