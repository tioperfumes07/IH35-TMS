export default {
  name: "verify-property-tax-rendition-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-property-tax-rendition-staged-filters.mjs"]);
  },
};
