export default {
  name: "verify-sync-panel-pull-reconcile-errors-surfaced",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-sync-panel-pull-reconcile-errors-surfaced.mjs"]) !== 0) {
      throw new Error("verify-sync-panel-pull-reconcile-errors-surfaced failed");
    }
  },
};
