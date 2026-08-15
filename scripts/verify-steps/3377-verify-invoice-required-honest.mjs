// LINK-F5191 — invoice Required-column honesty audit, full sweep (accounting/home/inventory/reports).
// (verify-step 3377 — CC-1 band, claimed in commit "FINDING: claim verify-step 3377 (cc-1 band)").
export default {
  name: "invoice-required-honest",
  run(ctx) {
    ctx.run("node", ["scripts/verify-invoice-required-honest.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-invoice-required-honest.mjs"]);
  },
};
