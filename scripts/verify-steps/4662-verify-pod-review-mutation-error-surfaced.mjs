export default {
  name: "verify-pod-review-mutation-error-surfaced",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-pod-review-mutation-error-surfaced.mjs"]) !== 0) {
      throw new Error("verify-pod-review-mutation-error-surfaced failed");
    }
  },
};
