export default {
  name: "verify-account-type-catalog-duplicate-search",
  run(ctx) {
    ctx.run("node", ["scripts/verify-account-type-catalog-duplicate-search.mjs"]);
  },
};
