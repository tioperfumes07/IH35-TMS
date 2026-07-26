// 1558-verify-no-dead-kpi-cards — C8 (CLICK-THROUGH: no dead KPI cards on primary surfaces).
//
// Every KPI/stat card on a primary surface (pages/**, components/home/**) must drill to its records
// or state an honest reason why it cannot, and its number must be live-backed or render "—".
// Run against pre-fix origin/main this FAILS with 129 problems: the required-drill card component
// does not exist, 80 card renders across 13 surfaces are dead clicks, 11 hand-rolled tiles never
// reach the shared card, and 37 numbers are hardcoded or zero-faked — including two SAFETY strips
// that turn an absent payload into a confident all-clear.
//
// The --selftest runs FIRST and plants 28 defects (a call site with no target, a brand-new dead
// card, a shared card missing its target, a no-op onClick, a factory that cannot navigate at all,
// hand-rolled tile chrome, a hand-rolled tile hiding behind a legitimate skeleton, a hardcoded
// number, a hardcoded string, a zero-fallback, a whole-snapshot zero fallback, a hardcoded dash
// strip, a placeholder "reason", a budget overrun, and 14 mutations of the shared component itself
// — the union loosened back to optional props, the em-dash rule deleted, the Link/button/aria/data
// markers removed, the file deleted) plus five classifier controls proving it does NOT claim detail
// rows, form fields, record-detail panels, commented-out JSX, interpolated template literals, or a
// loading/error shell. Every assertion is proven capable of failing before the real tree is judged.
export default {
  name: "verify-no-dead-kpi-cards",
  async run(ctx) {
    if ((await ctx.run("node", ["scripts/verify-no-dead-kpi-cards.mjs", "--selftest"])) !== 0) return 1;
    return ctx.run("node", ["scripts/verify-no-dead-kpi-cards.mjs"]);
  },
};
