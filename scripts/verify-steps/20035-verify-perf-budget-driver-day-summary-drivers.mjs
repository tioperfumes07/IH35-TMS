export default {
  name: "verify:perf-budget-driver-day-summary-drivers",
  run(ctx) {
    ctx.run("node", ["scripts/verify-perf-budget-driver-day-summary-drivers.mjs"]);
    ctx.run("node", ["scripts/verify-perf-budget-driver-day-summary-drivers.mjs", "--selftest"]);
  },
};
