export default {
  name: "verify-account-type-catalog-create",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-account-type-catalog-create.mjs"]) !== 0) {
      return 1;
    }
    return ctx.run("node", ["scripts/verify-account-type-catalog-create.mjs", "--selftest"]);
  },
};
