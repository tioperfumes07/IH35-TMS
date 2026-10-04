export default {
  name: "verify:invoice-line-patch-parameter-order",
  run(ctx) {
    ctx.run("node", ["scripts/verify-invoice-line-patch-parameter-order.mjs"]);
  },
};
