// verify-steps wrapper for scripts/verify-rate-resync-mints-invoice-when-none-exists.mjs
// (CLS-RATE-TYPED-AFTER-BOOK-NO-INVOICE, verify-step 3155). Same shape as
// verify-steps/3151-verify-money-kpi-strip-no-fake-zero-on-error.mjs — the guard is a standalone
// scripts/verify-*.mjs (static, no DB needed) and this wrapper is what makes it FULLY WIRED per
// verify-guard-wired.mjs.
export default {
  name: "verify-rate-resync-mints-invoice-when-none-exists",
  run(ctx) {
    ctx.run("node", ["scripts/verify-rate-resync-mints-invoice-when-none-exists.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-rate-resync-mints-invoice-when-none-exists.mjs"]);
  },
};
