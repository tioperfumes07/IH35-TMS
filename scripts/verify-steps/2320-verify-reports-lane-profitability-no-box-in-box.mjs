// GUARD — Lane Profitability box-in-box flatten (verify-step 2320 · Cursor EVEN band).
export default {
  name: "reports-lane-profitability-no-box-in-box",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-reports-lane-profitability-no-box-in-box.mjs"]);
  },
};
