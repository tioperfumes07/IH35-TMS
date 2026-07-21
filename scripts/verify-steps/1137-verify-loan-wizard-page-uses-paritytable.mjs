export default {
  name: "verify:loan-wizard-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-loan-wizard-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-loan-wizard-page-uses-paritytable.mjs"]);
  },
};
