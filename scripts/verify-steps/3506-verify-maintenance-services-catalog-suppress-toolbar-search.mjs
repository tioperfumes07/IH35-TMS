export default {
  name: "verify-maintenance-services-catalog-suppress-toolbar-search",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-services-catalog-suppress-toolbar-search.mjs"]);
    ctx.run("node", ["scripts/verify-91129-drvfin-pay-sections-slate-leftover-chrome.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-91129-drvfin-pay-sections-slate-leftover-chrome.mjs"]);
  },
};
