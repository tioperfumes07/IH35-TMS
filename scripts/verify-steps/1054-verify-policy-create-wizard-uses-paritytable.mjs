export default {
  name: "verify:policy-create-wizard-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-policy-create-wizard-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-policy-create-wizard-uses-paritytable.mjs"]);
    // BANK leftover refuse — CoverageGap/PolicyDetail/TypeCatalog house tokens
    ctx.run("node", ["scripts/verify-ins-cov-pol-slate-leftover-chrome.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ins-cov-pol-slate-leftover-chrome.mjs"]);
  },
};
