export default {
  name: "verify:item-line-quantity-rate-amount",
  run(ctx) {
    ctx.run("node", ["scripts/verify-item-line-quantity-rate-amount.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-item-line-quantity-rate-amount.mjs"]);
  },
};
