export default {
  name: "verify-cursor-pr-title-prefix",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cursor-pr-title-prefix.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-cursor-pr-title-prefix.mjs"]);
  },
};
