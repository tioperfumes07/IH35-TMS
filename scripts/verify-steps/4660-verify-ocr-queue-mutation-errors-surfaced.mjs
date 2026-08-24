export default {
  name: "verify-ocr-queue-mutation-errors-surfaced",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-ocr-queue-mutation-errors-surfaced.mjs"]) !== 0) {
      throw new Error("verify-ocr-queue-mutation-errors-surfaced failed");
    }
  },
};
