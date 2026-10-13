export default {
  name: "verify-related-party-loan-facility-bank-categorize-document",
  async run(ctx) {
    await ctx.run("node", [
      "scripts/verify-related-party-loan-facility-bank-categorize-document.mjs",
      "--selftest",
    ]);
    await ctx.run("node", ["scripts/verify-related-party-loan-facility-bank-categorize-document.mjs"]);
  },
};
