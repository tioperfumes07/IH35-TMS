export default {
  name: "verify-banking-recon-zero-variance",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-banking-recon-zero-variance.mjs"]);
  },
};
