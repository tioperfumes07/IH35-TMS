export default {
  name: "verify:dispatch-ocr-complete-queue-customer-match",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-ocr-complete-queue-customer-match.mjs"]);
  },
};
