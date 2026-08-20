export default {
  name: "verify:maintenance-pm-alerts-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-pm-alerts-range.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-maintenance-pm-alerts-range.mjs"]);
  },
};
