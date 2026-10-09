export default {
  name: "verify-surface-bar-combobox-inventory",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-surface-bar-combobox-inventory.mjs"]);
    // BANK-F91150 piggy — HosExceptions/DriverSchedulerRequest/DriverLeaveBalances slate leftover refuse
    await ctx.run("node", ["scripts/verify-91150-hos-sched-slate-leftover-chrome.mjs"]);
  },
};
