export default {
  name: "verify-accounting-catalog-profile",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-accounting-catalog-profile.mjs"]) !== 0) {
      return 1;
    }
    return ctx.run("node", ["scripts/verify-accounting-catalog-profile.mjs", "--selftest"]);
  },
};
