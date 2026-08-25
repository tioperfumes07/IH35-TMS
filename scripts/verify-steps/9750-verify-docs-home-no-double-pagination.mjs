export default {
  name: "verify-docs-home-no-double-pagination",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-docs-home-no-double-pagination.mjs"]) !== 0) {
      throw new Error("verify-docs-home-no-double-pagination failed");
    }
  },
};
