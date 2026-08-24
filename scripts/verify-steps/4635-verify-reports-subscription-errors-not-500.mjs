export default {
  name: "verify-reports-subscription-errors-not-500",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-reports-subscription-errors-not-500.mjs"]) !== 0) {
      throw new Error("verify-reports-subscription-errors-not-500 failed");
    }
  },
};
