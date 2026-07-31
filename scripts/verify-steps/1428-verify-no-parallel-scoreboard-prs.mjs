export default {
  name: "verify-no-parallel-scoreboard-prs",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-parallel-scoreboard-prs.mjs"]);
  },
};
