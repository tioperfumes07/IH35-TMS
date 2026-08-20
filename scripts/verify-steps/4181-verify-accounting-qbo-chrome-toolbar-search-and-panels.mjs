// verify-steps wrapper for scripts/verify-accounting-qbo-chrome-toolbar-search-and-panels.mjs
// (accounting qbo_chrome batch 3 of 3 — chrome.toolbar_search real gap fix on BillsPage.tsx plus 10
// leaf-specific guards closing theater coverage left by the old broad CURSOR-VERTICAL sweep), wired
// into CI for the first time per the standard Rule 37 claim-then-author pattern, verify-step 4181.
// Static, no DB — same shape as sibling verify-steps/*.mjs files.
export default {
  name: "verify-accounting-qbo-chrome-toolbar-search-and-panels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accounting-qbo-chrome-toolbar-search-and-panels.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-accounting-qbo-chrome-toolbar-search-and-panels.mjs"]);
  },
};
