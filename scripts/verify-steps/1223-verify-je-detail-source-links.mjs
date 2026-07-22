/** @type {import("./_context.mjs").VerifyStep} */
export default {
  name: "verify-je-detail-source-links",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-je-detail-source-links.mjs"]);
  },
};
