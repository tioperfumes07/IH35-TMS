export default {
  name: "verify-no-hold-language-in-active-blocks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-hold-language-in-active-blocks.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-hold-language-in-active-blocks.mjs"]);
  },
};
