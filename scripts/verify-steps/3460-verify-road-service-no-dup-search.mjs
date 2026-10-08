export default {
  name: "verify-road-service-no-dup-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-road-service-no-dup-search.mjs"]);
    // BANK leftover refuse — DriverInstructionsTextarea / QuickAssignModal / BookLoadStopsSection house tokens
    await ctx.run("node", ["scripts/verify-91277-bookload-dispatch-slate-leftover-chrome.mjs"]);
  },
};
