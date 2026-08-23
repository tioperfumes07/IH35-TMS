export default {
  name: "verify:customers-search-count-query-params",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customers-search-count-query-params.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customers-search-count-query-params.mjs"]);
  },
};
