export default {
  name: "verify:driver-day-summary-route-mounted",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-day-summary-route-mounted.mjs"]);
  },
};
