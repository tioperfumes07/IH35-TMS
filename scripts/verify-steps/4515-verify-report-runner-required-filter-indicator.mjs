export default {
  name: "verify-report-runner-required-filter-indicator",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-report-runner-required-filter-indicator.mjs"]) !== 0) {
      throw new Error("verify-report-runner-required-filter-indicator failed");
    }
  },
};
