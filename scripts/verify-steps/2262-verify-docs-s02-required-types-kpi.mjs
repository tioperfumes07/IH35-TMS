export default {
  name: "verify-docs-s02-required-types-kpi",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-docs-s02-required-types-kpi.mjs"]);
  },
};
