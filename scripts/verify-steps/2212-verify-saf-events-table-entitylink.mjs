export default {
  name: "verify-saf-events-table-entitylink",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-events-table-entitylink.mjs"]);
  },
};
