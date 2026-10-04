export default {
  name: "verify:invoice-maint-shop-human-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-invoice-maint-shop-human-labels.mjs"]);
  },
};
