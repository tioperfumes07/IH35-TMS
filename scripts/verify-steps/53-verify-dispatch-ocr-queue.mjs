export default {
  name: "verify-dispatch-ocr-queue",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:dispatch-ocr-queue"]) !== 0) {
      throw new Error("verify-dispatch-ocr-queue failed");
    }
  },
};
