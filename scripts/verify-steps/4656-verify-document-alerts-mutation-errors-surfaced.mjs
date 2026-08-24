export default {
  name: "verify-document-alerts-mutation-errors-surfaced",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-document-alerts-mutation-errors-surfaced.mjs"]) !== 0) {
      throw new Error("verify-document-alerts-mutation-errors-surfaced failed");
    }
  },
};
