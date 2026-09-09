export default {
  name: "verify-bank-recon-excludes-voided-transactions",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-recon-excludes-voided-transactions.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bank-recon-excludes-voided-transactions.mjs"]);
  },
};
