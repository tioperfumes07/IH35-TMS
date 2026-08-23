export default {
  name: "verify-unit-wear-telemetry-failure-truth",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-unit-wear-telemetry-failure-truth.mjs"]) !== 0) {
      throw new Error("verify-unit-wear-telemetry-failure-truth failed");
    }
  },
};
