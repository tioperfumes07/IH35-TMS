export default {
  name: "verify-driver-detail-catalog-failure-truth",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-driver-detail-catalog-failure-truth.mjs"]) !== 0) {
      throw new Error("verify-driver-detail-catalog-failure-truth failed");
    }
  },
};
