export default {
  name: "verify-acct-catalog-accounts-opco-scope",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-acct-catalog-accounts-opco-scope.mjs"]) !== 0) {
      return 1;
    }
    return ctx.run("node", ["scripts/verify-acct-catalog-accounts-opco-scope.mjs", "--selftest"]);
  },
};
