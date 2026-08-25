export default {
  name: "verify-settlement-summary-load-count-from-settlement-lines",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-settlement-summary-load-count-from-settlement-lines.mjs"]) !== 0) {
      throw new Error("verify-settlement-summary-load-count-from-settlement-lines failed");
    }
  },
};
