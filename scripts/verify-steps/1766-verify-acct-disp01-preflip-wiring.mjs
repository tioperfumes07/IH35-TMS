export default {
  name: "verify-acct-disp01-preflip-wiring",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-disp01-preflip-wiring.mjs"]);
  },
};
