export default {
  name: "verify-users-root-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-users-root-staged-filters.mjs"]);
    await ctx.run("node", ["scripts/verify-91071-submission-opening-coaroles-slate-leftover-chrome.mjs"]);
  },
};
