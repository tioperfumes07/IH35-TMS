/** @type {import("./_context.mjs").VerifyStep} */
export default {
  name: "verify-invoice-detail-je-links",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-invoice-detail-je-links.mjs"]);
  },
};
