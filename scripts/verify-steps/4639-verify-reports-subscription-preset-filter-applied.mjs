export default {
  name: "verify-reports-subscription-preset-filter-applied",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-reports-subscription-preset-filter-applied.mjs"]) !== 0) {
      throw new Error("verify-reports-subscription-preset-filter-applied failed");
    }
  },
};
