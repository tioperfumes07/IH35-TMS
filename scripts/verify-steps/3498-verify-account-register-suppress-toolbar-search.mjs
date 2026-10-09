export default {
  name: "verify-account-register-suppress-toolbar-search",
  run(ctx) {
    ctx.run("node", ["scripts/verify-account-register-suppress-toolbar-search.mjs"]);
    ctx.run("node", ["scripts/verify-91131-fuel-escrow-layover-slate-leftover-chrome.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-91131-fuel-escrow-layover-slate-leftover-chrome.mjs"]);
  },
};
