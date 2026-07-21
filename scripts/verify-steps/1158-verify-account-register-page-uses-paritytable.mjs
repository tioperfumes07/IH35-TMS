export default {
  name: "verify:account-register-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-account-register-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-account-register-page-uses-paritytable.mjs"]);
  },
};
