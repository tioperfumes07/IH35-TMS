export default {
  name: "verify-drivers-reference-catalog-suppress-toolbar-search",
  run(ctx) {
    ctx.run("node", ["scripts/verify-drivers-reference-catalog-suppress-toolbar-search.mjs"]);
    ctx.run("node", ["scripts/verify-91127-drv-team-ret-deduct-slate-leftover-chrome.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-91127-drv-team-ret-deduct-slate-leftover-chrome.mjs"]);
  },
};
