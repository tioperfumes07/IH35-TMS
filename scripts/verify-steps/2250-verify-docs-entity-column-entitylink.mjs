export default {
  name: "verify-docs-entity-column-entitylink",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-docs-entity-column-entitylink.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-docs-entity-column-entitylink.mjs"]);
  },
};
