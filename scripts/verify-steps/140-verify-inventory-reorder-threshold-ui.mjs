export default {
  name: "verify-inventory-reorder-threshold-ui",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-inventory-reorder-threshold-ui.mjs"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
