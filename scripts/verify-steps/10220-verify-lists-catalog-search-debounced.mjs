export default {
  name: "verify-lists-catalog-search-debounced",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-lists-catalog-search-debounced.mjs"]);
  },
};
