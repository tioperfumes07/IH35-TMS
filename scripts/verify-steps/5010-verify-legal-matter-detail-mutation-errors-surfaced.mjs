export default {
  name: "verify-legal-matter-detail-mutation-errors-surfaced",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-legal-matter-detail-mutation-errors-surfaced.mjs"]) !== 0) {
      throw new Error("verify-legal-matter-detail-mutation-errors-surfaced failed");
    }
  },
};
