export default {
  name: "verify-load-profitability-insurance-excludes-sample-data",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-load-profitability-insurance-excludes-sample-data.mjs"]) !== 0) {
      throw new Error("verify-load-profitability-insurance-excludes-sample-data failed");
    }
  },
};
