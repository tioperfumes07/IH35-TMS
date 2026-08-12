// verify-steps wrapper for scripts/verify-load-drawer-settlement-tab-load-aware.mjs
// (LOAD-SETTLEMENT-TAB-SHOWS-OPEN-NOT-SETTLING, verify-step 3159). Same shape as
// verify-steps/3155-verify-rate-resync-mints-invoice-when-none-exists.mjs — the guard is a standalone
// scripts/verify-*.mjs (static, no DB needed) and this wrapper is what makes it FULLY WIRED per
// verify-guard-wired.mjs.
export default {
  name: "verify-load-drawer-settlement-tab-load-aware",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-drawer-settlement-tab-load-aware.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-load-drawer-settlement-tab-load-aware.mjs"]);
  },
};
