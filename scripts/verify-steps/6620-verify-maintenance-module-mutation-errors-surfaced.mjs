export default {
  name: "verify-maintenance-module-mutation-errors-surfaced",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-maintenance-module-mutation-errors-surfaced.mjs"]) !== 0) {
      throw new Error("verify-maintenance-module-mutation-errors-surfaced failed");
    }
  },
};
