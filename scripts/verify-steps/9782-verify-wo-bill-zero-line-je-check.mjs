export default {
  name: "verify-wo-bill-zero-line-je-check",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-wo-bill-zero-line-je-check.mjs"]) !== 0) {
      throw new Error("verify-wo-bill-zero-line-je-check failed");
    }
  },
};
