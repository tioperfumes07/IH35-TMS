export default {
  name: "verify-settlement-approve-pay-chain-reachable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlement-approve-pay-chain-reachable.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-settlement-approve-pay-chain-reachable.mjs"]);
  },
};
