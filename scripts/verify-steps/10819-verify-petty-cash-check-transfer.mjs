export default {
  name: "verify-petty-cash-check-transfer",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-petty-cash-check-transfer.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-petty-cash-check-transfer.mjs"]);
  },
};
