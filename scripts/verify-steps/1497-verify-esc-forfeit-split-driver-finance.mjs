export default {
  name: "verify-esc-forfeit-split-driver-finance",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-esc-forfeit-split-driver-finance.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-esc-forfeit-split-driver-finance.mjs"]);
  },
};
