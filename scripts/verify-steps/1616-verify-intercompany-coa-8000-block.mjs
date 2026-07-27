export default {
  name: "verify-intercompany-coa-8000-block",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-intercompany-coa-8000-block.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-intercompany-coa-8000-block.mjs"]);
  },
};
