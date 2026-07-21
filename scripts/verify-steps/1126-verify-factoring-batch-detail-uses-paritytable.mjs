export default {
  name: "verify:factoring-batch-detail-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-batch-detail-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factoring-batch-detail-uses-paritytable.mjs"]);
  },
};
