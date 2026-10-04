export default {
  name: "verify:audit-fix-11-qbo-sync-status-loads",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-fix-11-qbo-sync-status-loads.mjs"]);
  },
};
