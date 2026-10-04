export default {
  name: "verify:driver-day-summary-empty-state-not-red",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-day-summary-empty-state-not-red.mjs"]);
  },
};
