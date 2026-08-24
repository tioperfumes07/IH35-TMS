export default {
  name: "verify-lists-deactivate-mutation-errors-surfaced",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-lists-deactivate-mutation-errors-surfaced.mjs"]) !== 0) {
      throw new Error("verify-lists-deactivate-mutation-errors-surfaced failed");
    }
  },
};
