export default {
  name: "verify-expenses-projection-opco-lines",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-expenses-projection-opco-lines.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-expenses-projection-opco-lines.mjs"]);
  },
};
