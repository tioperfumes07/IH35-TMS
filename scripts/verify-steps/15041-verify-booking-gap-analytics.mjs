export default {
  name: "verify:booking-gap-analytics",
  run(ctx) {
    ctx.run("node", ["scripts/verify-booking-gap-analytics.mjs"]);
  },
};
