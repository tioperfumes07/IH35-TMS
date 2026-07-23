export default {
  name: "verify-acct-factor-recon-invoice-link",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-factor-recon-invoice-link.mjs"]);
  },
};
