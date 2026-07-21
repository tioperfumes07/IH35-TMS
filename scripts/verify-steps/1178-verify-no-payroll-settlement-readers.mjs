export default {
  name: "verify:no-payroll-settlement-readers",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-payroll-settlement-readers.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-no-payroll-settlement-readers.mjs"]);
  },
};
