export default {
  name: "verify-finance-landing-hub",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-finance-landing-hub.mjs"]) !== 0) {
      return 1;
    }
    return ctx.run("node", ["scripts/verify-finance-landing-hub.mjs", "--selftest"]);
  },
};
