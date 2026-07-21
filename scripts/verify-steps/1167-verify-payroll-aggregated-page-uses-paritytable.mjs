export default {
  name: "verify:payroll-aggregated-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-payroll-aggregated-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-payroll-aggregated-page-uses-paritytable.mjs"]);
  },
};
