export default {
  name: "verify-factoring-collapsed-filter-chrome",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-factoring-collapsed-filter-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-factoring-collapsed-filter-chrome.mjs"]);
  },
};
