// verify-steps wrapper for scripts/verify-qbo-sync-bill-payment-phantom-column.mjs
// (LV-QBO-SYNC-BILL-PAYMENT-PHANTOM-BILL-NUMBER, verify-step 3125). Same shape as
// verify-steps/3109-verify-flag-keys-seeded.mjs and siblings — the guard is a standalone
// scripts/verify-*.mjs (static, no DB needed) and this wrapper is what makes it FULLY WIRED per
// verify-guard-wired.mjs.
export default {
  name: "verify-qbo-sync-bill-payment-phantom-column",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-sync-bill-payment-phantom-column.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-qbo-sync-bill-payment-phantom-column.mjs"]);
  },
};
