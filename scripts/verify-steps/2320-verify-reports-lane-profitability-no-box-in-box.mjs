// GUARD — Lane Profitability box-in-box flatten (verify-step 2320 · Cursor EVEN band).
// BANK-F91519: leftover YAxis tick 11px + leftover refuse --selftest + live
export default {
  name: "reports-lane-profitability-no-box-in-box",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reports-lane-profitability-no-box-in-box.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-reports-lane-profitability-no-box-in-box.mjs"]);
  },
};
