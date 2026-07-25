export default {
  name: "verify-acct-r14-sales-tax-autoload",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-acct-r14-sales-tax-autoload.mjs"]) !== 0) return 1;
    return ctx.run("node", ["scripts/verify-acct-r14-sales-tax-autoload.mjs", "--selftest"]);
  },
};
