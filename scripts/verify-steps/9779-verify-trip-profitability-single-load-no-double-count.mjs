export default {
  name: "verify-trip-profitability-single-load-no-double-count",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-trip-profitability-single-load-no-double-count.mjs"]) !== 0) {
      throw new Error("verify-trip-profitability-single-load-no-double-count failed");
    }
  },
};
