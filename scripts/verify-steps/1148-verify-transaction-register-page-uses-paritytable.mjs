export default {
  name: "verify:transaction-register-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-transaction-register-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-transaction-register-page-uses-paritytable.mjs"]);
  },
};
