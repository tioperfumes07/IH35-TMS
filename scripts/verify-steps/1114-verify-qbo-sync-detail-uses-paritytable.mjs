export default {
  name: "verify:qbo-sync-detail-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-sync-detail-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-qbo-sync-detail-uses-paritytable.mjs"]);
  },
};
