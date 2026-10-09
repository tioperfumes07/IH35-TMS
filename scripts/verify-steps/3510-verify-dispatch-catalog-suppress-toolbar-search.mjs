export default {
  name: "verify-dispatch-catalog-suppress-toolbar-search",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-catalog-suppress-toolbar-search.mjs"]);
    ctx.run("node", ["scripts/verify-91128-maint-fuel-tb-slate-leftover-chrome.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-91128-maint-fuel-tb-slate-leftover-chrome.mjs"]);
  },
};
