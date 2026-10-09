export default {
  name: "verify-maint-wo-create-primary-opens",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-maint-wo-create-primary-opens.mjs"]);
    // BANK-F91458 — WO three dates as columns (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-maint-wo-three-dates.mjs", "--selftest"]);
    // BANK leftover refuse — WorkOrderDetail / MaintenanceSettings / FaultCodeAlerts house tokens
    await ctx.run("node", ["scripts/verify-wo-maint-settings-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-wo-maint-settings-slate-leftover-chrome.mjs"]);
    // BANK-F91088 — FaroImport / DriftAlerts / PlaidItem slate leftover refuse
    await ctx.run("node", ["scripts/verify-91088-faroimp-drift-plaid-slate-leftover-chrome.mjs"]);
  },
};
