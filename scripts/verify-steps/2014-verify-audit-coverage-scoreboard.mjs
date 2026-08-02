// AUDIT-COVERAGE-LIVE generated scoreboard + SIDEBAR_ITEM_IDS Module column (step 2014).
export default {
  name: "verify:audit-coverage-scoreboard",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-audit-coverage-scoreboard.mjs"]);
  },
};
