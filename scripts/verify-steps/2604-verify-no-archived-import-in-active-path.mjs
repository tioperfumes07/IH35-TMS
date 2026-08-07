export default {
  name: "verify:no-archived-import-in-active-path",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-archived-import-in-active-path.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-archived-import-in-active-path.mjs"]);
  },
};
