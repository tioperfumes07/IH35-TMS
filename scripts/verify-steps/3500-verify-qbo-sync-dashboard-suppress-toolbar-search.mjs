export default {
  name: "verify-qbo-sync-dashboard-suppress-toolbar-search",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-sync-dashboard-suppress-toolbar-search.mjs"]);
    // BANK leftover refuse — QboSyncHealth/QboStyleHome/PendingApprovals house tokens
    ctx.run("node", ["scripts/verify-home-qbo-slate-leftover-chrome.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-home-qbo-slate-leftover-chrome.mjs"]);
  },
};
