export default {
  name: "verify-drivers-master-data-suppress-toolbar-search",
  run(ctx) {
    ctx.run("node", ["scripts/verify-drivers-master-data-suppress-toolbar-search.mjs"]);
    ctx.run("node", ["scripts/verify-91125-legal-fuel-slate-leftover-chrome.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-91125-legal-fuel-slate-leftover-chrome.mjs"]);
  },
};
