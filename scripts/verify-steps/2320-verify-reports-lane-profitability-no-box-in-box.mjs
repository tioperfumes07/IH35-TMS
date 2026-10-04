// GUARD — Lane Profitability box-in-box flatten (verify-step 2320 · Cursor EVEN band).
// BANK-F91519: leftover YAxis tick 11px + leftover refuse --selftest + live
// BANK-F91535: leftover text-slate-* → house #4B5563 / #0F1219 / #E5E7EB (frame border-slate-* stay locked by box-in-box)
// BANK-F91537: leftover frame border-slate-* / divide-slate-* → house #E5E7EB; box-in-box needles retargeted, not deleted
export default {
  name: "reports-lane-profitability-no-box-in-box",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reports-lane-profitability-no-box-in-box.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-reports-lane-profitability-no-box-in-box.mjs"]);
  },
};
