export default {
  name: "verify-maintenance-parts-catalog-suppress-toolbar-search",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-parts-catalog-suppress-toolbar-search.mjs"]);
  },
};
