export default {
  name: "verify-hooks-before-early-return",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-hooks-before-early-return.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-hooks-before-early-return.mjs"]);
  },
};
