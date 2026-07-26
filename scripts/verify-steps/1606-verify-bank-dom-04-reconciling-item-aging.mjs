export default {
  name: "verify:bank-dom-04-reconciling-item-aging",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-bank-dom-04-reconciling-item-aging.mjs"]);
  },
};
