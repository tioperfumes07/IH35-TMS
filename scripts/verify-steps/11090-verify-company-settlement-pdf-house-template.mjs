export default {
  name: "verify-company-settlement-pdf-house-template",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-company-settlement-pdf-house-template.mjs"]);
  },
};
