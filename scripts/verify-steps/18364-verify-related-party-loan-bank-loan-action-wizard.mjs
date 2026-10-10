export default {
  name: "verify-related-party-loan-bank-loan-action-wizard",
  async run(ctx) {
    await ctx.run("node", [
      "scripts/verify-related-party-loan-bank-loan-action-wizard.mjs",
      "--selftest",
    ]);
    await ctx.run("node", ["scripts/verify-related-party-loan-bank-loan-action-wizard.mjs"]);
  },
};
