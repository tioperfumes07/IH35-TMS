export default {
  name: "verify:event-log-guc-reconcile",
  run(ctx) {
    ctx.run("node", ["scripts/verify-event-log-guc-reconcile.mjs"]);
  },
};
