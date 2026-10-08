export default {
  name: "verify:document-alerts-tabs-url-sync",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-document-alerts-tabs-url-sync.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-document-alerts-tabs-url-sync.mjs"]);
    // BANK-F91215 piggyback — DriverShell / DocumentAlertsPage / MapView leftover slate refuse
    await ctx.run("node", ["scripts/verify-drvshell-docalerts-map-slate-leftover-chrome.mjs"]);
  },
};
