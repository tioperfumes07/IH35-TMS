export default {
  name: "verify-autocategorize-sql-syntax",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-autocategorize-sql-syntax.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-autocategorize-sql-syntax.mjs"]);
  },
};
