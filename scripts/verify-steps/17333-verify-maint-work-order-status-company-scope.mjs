export default {
  name: "verify:maint-work-order-status-company-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maint-work-order-status-company-scope.mjs"]);
  },
};
