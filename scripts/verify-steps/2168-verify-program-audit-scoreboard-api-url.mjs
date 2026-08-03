export default {
  name: "verify-program-audit-scoreboard-api-url",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-program-audit-scoreboard-api-url.mjs"]);
  },
};
