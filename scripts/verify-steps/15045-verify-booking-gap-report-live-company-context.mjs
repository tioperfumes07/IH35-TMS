export default {
  name: "verify:booking-gap-report-live-company-context",
  run(ctx) {
    ctx.run("node", ["scripts/verify-booking-gap-report-live-company-context.mjs"]);
  },
};
