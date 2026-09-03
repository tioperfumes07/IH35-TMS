export default {
  name: "verify-table-header-and-date-column",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-table-header-and-date-column.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-table-header-and-date-column.mjs"]);
  },
};
