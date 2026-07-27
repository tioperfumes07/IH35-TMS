export default {
  name: "verify-wo-line-canonical-columns",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-wo-line-canonical-columns.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-wo-line-canonical-columns.mjs"]);
  },
};
