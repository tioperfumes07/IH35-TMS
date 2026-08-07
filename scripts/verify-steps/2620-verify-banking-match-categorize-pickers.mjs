// verify-banking-match-categorize-pickers — §9.0 item 17 pattern sweep
export default {
  name: "verify:banking-match-categorize-pickers",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-banking-match-categorize-pickers.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-banking-match-categorize-pickers.mjs"]);
  },
};
