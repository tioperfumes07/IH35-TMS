export default {
  name: "verify-recon-worklist-excludes-voided-transactions",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-recon-worklist-excludes-voided-transactions.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-recon-worklist-excludes-voided-transactions.mjs"]);
  },
};
