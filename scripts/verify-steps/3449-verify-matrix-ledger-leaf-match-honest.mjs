export default {
  name: "verify-matrix-ledger-leaf-match-honest",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-matrix-ledger-leaf-match-honest.mjs"]);
  },
};
