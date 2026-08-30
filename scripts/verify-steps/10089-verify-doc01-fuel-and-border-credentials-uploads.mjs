/** DOC-01 remainder -- CreateFuelTransactionModal + BorderCredentialsSection upload wiring. */
export default {
  name: "verify-doc01-fuel-and-border-credentials-uploads",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-doc01-fuel-and-border-credentials-uploads.mjs"]);
    await ctx.run("node", ["scripts/verify-doc01-fuel-and-border-credentials-uploads.mjs", "--selftest"]);
  },
};
