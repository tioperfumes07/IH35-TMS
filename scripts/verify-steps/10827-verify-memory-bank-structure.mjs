export default {
  name: "verify-memory-bank-structure",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-memory-bank-structure.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-memory-bank-structure.mjs"]);
  },
};
