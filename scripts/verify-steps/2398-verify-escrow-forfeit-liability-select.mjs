export default {
  name: "verify-escrow-forfeit-liability-select",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-escrow-forfeit-liability-select.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-escrow-forfeit-liability-select.mjs"]);
  },
};
