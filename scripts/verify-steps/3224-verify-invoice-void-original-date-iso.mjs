// verify-steps wrapper for scripts/verify-invoice-void-original-date-iso.mjs (ACCT-F5029, step 3224).
export default {
  name: "verify-invoice-void-original-date-iso",
  run(ctx) {
    ctx.run("node", ["scripts/verify-invoice-void-original-date-iso.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-invoice-void-original-date-iso.mjs"]);
  },
};
