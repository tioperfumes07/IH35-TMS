export default {
  name: "verify-no-units-display-id",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-units-display-id.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-units-display-id.mjs"]);
  },
};
