export default {
  name: "verify-invoice-pickup-sort",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-invoice-pickup-sort.mjs"]) !== 0) {
      return 1;
    }
    return ctx.run("node", ["scripts/verify-invoice-pickup-sort.mjs", "--selftest"]);
  },
};
