export default {
  name: "verify-list-rows-use-datatable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-list-rows-use-datatable.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-list-rows-use-datatable.mjs"]);
  },
};
