export default {
  name: "verify:qbo-sync-status-dashboard-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-sync-status-dashboard-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-qbo-sync-status-dashboard-uses-paritytable.mjs"]);
  },
};
