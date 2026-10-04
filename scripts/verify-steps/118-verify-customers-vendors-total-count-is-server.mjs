export default {
  name: "verify-customers-vendors-total-count-is-server",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customers-vendors-total-count-is-server.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customers-vendors-total-count-is-server.mjs"]);
    // BANK-F91438 — C-50 active-company bound pin + roster counts (never ran in CI).
    ctx.run("node", ["scripts/ops/verify-c50-active-company-bound-pin.mjs", "--selftest"]);
  },
};
