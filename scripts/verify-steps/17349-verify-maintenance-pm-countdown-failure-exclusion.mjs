export default {
  name: "verify:maintenance-pm-countdown-failure-exclusion",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-pm-countdown-failure-exclusion.mjs"]);
  },
};
