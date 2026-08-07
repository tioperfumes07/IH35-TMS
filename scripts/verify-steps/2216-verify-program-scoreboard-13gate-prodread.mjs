export default {
  name: "verify-program-scoreboard-13gate-prodread",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-program-scoreboard-13gate-prodread.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-program-scoreboard-13gate-prodread.mjs"]);
  },
};
