export default {
  name: "verify:payroll-aggregate-table-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-payroll-aggregate-table-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-payroll-aggregate-table-uses-paritytable.mjs"]);
  },
};
