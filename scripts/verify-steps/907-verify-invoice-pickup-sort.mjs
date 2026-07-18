export default {
  name: "verify-invoice-pickup-sort",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-invoice-pickup-sort.mjs"]) !== 0) {
      throw new Error("verify-invoice-pickup-sort failed");
    }
    if (
      ctx.run("node", [
        "scripts/verify-invoice-pickup-sort.mjs",
        "--selftest",
      ]) !== 0
    ) {
      throw new Error("verify-invoice-pickup-sort selftest failed");
    }
  },
};
