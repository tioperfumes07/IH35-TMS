export default {
  name: "verify-dispatch-catalog-suppress-toolbar-search",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-catalog-suppress-toolbar-search.mjs"]);
  },
};
