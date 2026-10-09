export default {
  name: "verify-parts-master-data-suppress-toolbar-search",
  run(ctx) {
    ctx.run("node", ["scripts/verify-parts-master-data-suppress-toolbar-search.mjs"]);
    ctx.run("node", ["scripts/verify-91126-fact-vend-fuel-slate-leftover-chrome.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-91126-fact-vend-fuel-slate-leftover-chrome.mjs"]);
  },
};
