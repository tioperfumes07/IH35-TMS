export default {
  name: "verify-entity-picker-registry-honest-labels",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-entity-picker-registry-honest-labels.mjs"]);
  },
};
