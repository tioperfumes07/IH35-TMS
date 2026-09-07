export default {
  name: "verify-round1621-rule-match-prefill",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-round1621-rule-match-prefill.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-round1621-rule-match-prefill.mjs"]);
  },
};
