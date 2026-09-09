export default {
  name: "verify-recon-usmca-bank-suggestion-coverage",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-recon-usmca-bank-suggestion-coverage.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-recon-usmca-bank-suggestion-coverage.mjs"]);
  },
};
