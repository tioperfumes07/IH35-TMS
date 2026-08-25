export default {
  name: "verify-maintenance-cost-outsourced-not-hardcoded",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-maintenance-cost-outsourced-not-hardcoded.mjs"]) !== 0) {
      throw new Error("verify-maintenance-cost-outsourced-not-hardcoded failed");
    }
  },
};
