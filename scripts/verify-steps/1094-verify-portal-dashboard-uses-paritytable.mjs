export default {
  name: "verify:portal-dashboard-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-portal-dashboard-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-portal-dashboard-uses-paritytable.mjs"]);
    // BANK leftover refuse — PortalLayout/Profile/LoadDetail house tokens
    ctx.run("node", ["scripts/verify-portal-pages-slate-leftover-chrome.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-portal-pages-slate-leftover-chrome.mjs"]);
  },
};
