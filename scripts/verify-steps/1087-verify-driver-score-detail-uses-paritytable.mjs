export default {
  name: "verify:driver-score-detail-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-score-detail-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-score-detail-uses-paritytable.mjs"]);
  },
};
