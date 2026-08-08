export default {
  name: "verify-class-scoreboard-individual-columns",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-class-scoreboard-individual-columns.mjs"]);
  },
};
