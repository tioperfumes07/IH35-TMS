export default {
  name: "verify-oem-parts-catalog-suppress-toolbar-search",
  run(ctx) {
    ctx.run("node", ["scripts/verify-oem-parts-catalog-suppress-toolbar-search.mjs"]);
  },
};
