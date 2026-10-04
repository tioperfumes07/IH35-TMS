export default {
  name: "verify:maintenance-kpi-pm-compliance-exact-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-kpi-pm-compliance-exact-range.mjs"]);
  },
};
