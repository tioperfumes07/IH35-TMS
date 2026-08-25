export default {
  name: "verify-safety-dispatch-finance-other-back-buttons-wired",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-safety-dispatch-finance-other-back-buttons-wired.mjs"]) !== 0) {
      throw new Error("verify-safety-dispatch-finance-other-back-buttons-wired failed");
    }
  },
};
