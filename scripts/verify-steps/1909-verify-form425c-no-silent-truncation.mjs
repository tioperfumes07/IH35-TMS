export default {
  name: "verify-form425c-no-silent-truncation",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-form425c-no-silent-truncation.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-form425c-no-silent-truncation.mjs"]);
  },
};
