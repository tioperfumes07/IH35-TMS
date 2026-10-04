export default {
  name: "verify-mdp-panel-proportion",
  run(ctx) {
    ctx.run("node", ["scripts/verify-mdp-panel-proportion.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-mdp-panel-proportion.mjs"]);
    // BANK-F91505 — WeeklyRevenueChart leftover #64748b axis stroke refuse (1215 is ODD; leftover now on this EVEN host).
    // BANK-F91539 — WeeklyRevenueChart leftover text-slate-* / border-slate-* / bg-slate-* → house tokens
    ctx.run("node", ["scripts/verify-home-kpi-range-toggle.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-home-kpi-range-toggle.mjs"]);
  },
};
