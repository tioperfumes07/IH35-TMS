export default {
  name: "verify:qbo-sync-health-card-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-sync-health-card-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-qbo-sync-health-card-uses-paritytable.mjs"]);
  },
};
