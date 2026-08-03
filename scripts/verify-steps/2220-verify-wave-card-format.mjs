export default {
  name: "verify-wave-card-format",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-wave-card-format.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-wave-card-format.mjs"]);
  },
};
