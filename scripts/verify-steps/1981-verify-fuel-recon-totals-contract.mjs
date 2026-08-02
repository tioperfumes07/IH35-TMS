export default {
  name: "verify-fuel-recon-totals-contract",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fuel-recon-totals-contract.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-fuel-recon-totals-contract.mjs"]);
  },
};
