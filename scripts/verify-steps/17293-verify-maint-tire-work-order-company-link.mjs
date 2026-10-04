export default {
  name: "verify:maint-tire-work-order-company-link",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maint-tire-work-order-company-link.mjs"]);
  },
};
