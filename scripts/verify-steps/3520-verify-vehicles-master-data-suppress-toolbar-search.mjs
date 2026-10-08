export default {
  name: "verify-vehicles-master-data-suppress-toolbar-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-vehicles-master-data-suppress-toolbar-search.mjs"]);
    // BANK leftover refuse — CreateTaskModal/taskDisplay/BulkActionBar house tokens
    await ctx.run("node", ["scripts/verify-tasks-bulk-slate-leftover-chrome.mjs"]);
  },
};
