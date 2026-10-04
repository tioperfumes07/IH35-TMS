export default {
  name: "verify:qbo-sync-event-log-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-sync-event-log-tenant-scope.mjs"]);
  },
};
