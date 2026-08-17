export default {
  name: "verify-docs-home-entity-no-raw-uuid",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-docs-home-entity-no-raw-uuid.mjs"]);
  },
};
