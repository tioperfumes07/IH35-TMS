/** @matrix-built {"modules":["accounting","banking","driver-hub","factoring","fuel","legal","lists","maintenance","reports"],"cols":["connectivity"],"leafRe":"^(accounting\\.modal\\.decide_fault|accounting\\.panel\\.(factoring_interest_accrual|faro_cash_reserve_reclass|register_inline_edit)|banking\\.panel\\.banking_kpi|driver-hub\\.panel\\.driver|factoring\\.panel\\.|fuel\\.(drawer\\.(end_card|void_card)|modal\\.card_overage_(exempt|void)|panel\\.card_issuers)|legal\\.panel\\.matter_reserve|lists\\.panel\\.ledger_kpi|maintenance\\.panel\\.pm_cost_per_mile|reports\\.panel\\.three_mile_cpm)$","task":"DEVIN-NONMONEY-CONNECTIVITY-REMAINDER-23"} */
// Leaf-specific connectivity coverage for the 23 unowned non-money remainder cells (Devin, 2026-10-05).
export default {
  name: "verify:nonmoney-connectivity-remainder",
  run(ctx) {
    ctx.run("node", ["scripts/verify-nonmoney-connectivity-remainder.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-nonmoney-connectivity-remainder.mjs"]);
  },
};
