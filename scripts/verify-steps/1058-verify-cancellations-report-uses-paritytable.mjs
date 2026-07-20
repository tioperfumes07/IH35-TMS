export default {
  name: "verify:cancellations-report-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cancellations-report-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-cancellations-report-uses-paritytable.mjs"]);
  },
};
