export default {
  name: "verify-settlements-home-board32-parity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlements-home-board32-parity.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-settlements-home-board32-parity.mjs"]);
  },
};
