export default {
  name: "verify-assignment-history-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-assignment-history-staged-filters.mjs"]);
    // BANK-F91221 piggyback — CurrentAssignmentSection / HOSStatusSection / DriverAssignmentHistorySection leftover slate refuse
    await ctx.run("node", ["scripts/verify-drv-assign-hos-hist-slate-leftover-chrome.mjs"]);
  },
};
