export default {
  name: "verify-acct-maintenance-shop-hub",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-acct-maintenance-shop-hub.mjs"]) !== 0) return 1;
    return ctx.run("node", ["scripts/verify-acct-maintenance-shop-hub.mjs", "--selftest"]);
  },
};
