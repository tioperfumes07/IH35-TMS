export default {
  name: "verify:customer-relationship-health-complete-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-relationship-health-complete-range.mjs"]);
  },
};
