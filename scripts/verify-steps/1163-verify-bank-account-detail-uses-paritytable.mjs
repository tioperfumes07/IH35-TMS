export default {
  name: "verify:bank-account-detail-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-account-detail-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bank-account-detail-uses-paritytable.mjs"]);
  },
};
