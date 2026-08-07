export default {
  name: "verify-zero-count-completeness-discriminator",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-zero-count-completeness-discriminator.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-zero-count-completeness-discriminator.mjs"]);
  },
};
