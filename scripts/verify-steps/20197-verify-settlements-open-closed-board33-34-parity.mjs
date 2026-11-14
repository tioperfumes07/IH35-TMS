export default {
  name: "verify-settlements-open-closed-board33-34-parity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlements-open-closed-board33-34-parity.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-settlements-open-closed-board33-34-parity.mjs"]);
  },
};
