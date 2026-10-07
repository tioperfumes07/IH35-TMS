export default {
  name: "verify:audit-reports-subnav-present",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-reports-subnav-present.mjs"]);
    // BANK leftover refuse — ARAging/SettlementSummary/ReportsHub house tokens
    ctx.run("node", ["scripts/verify-ar-settle-hub-slate-leftover-chrome.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ar-settle-hub-slate-leftover-chrome.mjs"]);
  },
};
