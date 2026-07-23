export default {
  name: "verify-acct-open-balance-nets-vendor-credits",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-acct-open-balance-nets-vendor-credits.mjs"]) !== 0) return 1;
    return ctx.run("node", ["scripts/verify-acct-open-balance-nets-vendor-credits.mjs", "--selftest"]);
  },
};
