export default {
  name: "verify-unmatch-clears-both-sides",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-unmatch-clears-both-sides.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-unmatch-clears-both-sides.mjs"]);
  },
};
