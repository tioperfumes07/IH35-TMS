export default {
  name: "verify-drivers-roster-suppress-toolbar-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-drivers-roster-suppress-toolbar-search.mjs"]);
    // BANK leftover refuse — AuthGatePanel/DispatchSubnav/DispatchAlertsPage house tokens
    await ctx.run("node", ["scripts/verify-disp-auth-subnav-alerts-slate-leftover-chrome.mjs"]);
  },
};
