export default {
  name: "verify:dispatch-customer-filter-failure-honesty",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-customer-filter-failure-honesty.mjs"]);
  },
};
