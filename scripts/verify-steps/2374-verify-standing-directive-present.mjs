export default {
  name: "verify-standing-directive-present",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-standing-directive-present.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-standing-directive-present.mjs"]);
  },
};
