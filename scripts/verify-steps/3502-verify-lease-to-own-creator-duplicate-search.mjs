export default {
  name: "verify-lease-to-own-creator-duplicate-search",
  run(ctx) {
    ctx.run("node", ["scripts/verify-lease-to-own-creator-duplicate-search.mjs"]);
    ctx.run("node", ["scripts/verify-91130-maint-reverse-slate-leftover-chrome.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-91130-maint-reverse-slate-leftover-chrome.mjs"]);
  },
};
