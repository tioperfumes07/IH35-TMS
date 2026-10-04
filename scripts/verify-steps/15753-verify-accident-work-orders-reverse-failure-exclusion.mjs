export default {
  name: "verify:accident-work-orders-reverse-failure-exclusion",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accident-work-orders-reverse-failure-exclusion.mjs"]);
  },
};
