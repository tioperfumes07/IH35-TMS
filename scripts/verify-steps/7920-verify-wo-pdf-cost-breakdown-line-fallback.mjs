export default {
  name: "verify-wo-pdf-cost-breakdown-line-fallback",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-wo-pdf-cost-breakdown-line-fallback.mjs"]) !== 0) {
      throw new Error("verify-wo-pdf-cost-breakdown-line-fallback failed");
    }
  },
};
