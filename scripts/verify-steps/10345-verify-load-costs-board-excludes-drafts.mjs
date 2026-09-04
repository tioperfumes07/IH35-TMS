export default {
  name: "verify-load-costs-board-excludes-drafts",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-costs-board-excludes-drafts.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-load-costs-board-excludes-drafts.mjs"]);
  },
};
