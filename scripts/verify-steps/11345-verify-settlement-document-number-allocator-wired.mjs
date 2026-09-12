export default {
  name: "verify-settlement-document-number-allocator-wired",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-settlement-document-number-allocator-wired.mjs"]) !== 0) {
      throw new Error("verify-settlement-document-number-allocator-wired failed");
    }
  },
};
