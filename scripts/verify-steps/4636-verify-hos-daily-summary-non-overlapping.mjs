export default {
  name: "verify-hos-daily-summary-non-overlapping",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-hos-daily-summary-non-overlapping.mjs"]) !== 0) {
      throw new Error("verify-hos-daily-summary-non-overlapping failed");
    }
  },
};
