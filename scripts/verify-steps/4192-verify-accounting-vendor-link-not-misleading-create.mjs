// verify-steps wrapper for scripts/verify-accounting-vendor-link-not-misleading-create.mjs
// (WAVE 1 accounting item-8 chrome-law audit, found live-interacting with /accounting per the
// "next wave of chrome verification" instruction: AccountingSubNavWrapper.tsx's "+ Vendor" was a
// plain navigation link mislabeled with the app-wide "+X = opens a create flow" convention,
// relabeled to "Go to vendors"), verify-step 4192, Rule 37 claim-then-author pattern (claim shipped
// in #13539). Static, no DB — same shape as sibling verify-steps/*.mjs files.
export default {
  name: "verify-accounting-vendor-link-not-misleading-create",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accounting-vendor-link-not-misleading-create.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-accounting-vendor-link-not-misleading-create.mjs"]);
  },
};
