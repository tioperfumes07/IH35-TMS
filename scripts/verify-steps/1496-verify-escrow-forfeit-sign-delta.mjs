export default {
  name: "verify-escrow-forfeit-sign-delta",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-escrow-forfeit-sign-delta.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-escrow-forfeit-sign-delta.mjs"]);
  },
};
