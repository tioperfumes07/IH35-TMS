export default {
  name: "verify:audit-report-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-report-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-audit-report-page-uses-paritytable.mjs"]);
  },
};
