export default {
  name: "verify:account-register-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-account-register-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-account-register-page-uses-paritytable.mjs"]);
    // BANK-F91432 — ORDERS §B-1 register connectivity: gear/chooser, ✓ hops, original-doc match banners.
    // Ops pack already PASS locally; CI never invoked it. Ride the existing EVEN step (Rule 37).
    ctx.run("node", ["scripts/ops/verify-b1-account-register.mjs", "--selftest"]);
    ctx.run("node", ["scripts/ops/verify-b1-online-banking-match-banner.mjs", "--selftest"]);
    ctx.run("node", ["scripts/ops/verify-b1-cash-advance-match-banner.mjs", "--selftest"]);
  },
};
