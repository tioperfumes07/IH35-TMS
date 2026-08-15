export default {
  name: "verify-parts-master-data-suppress-toolbar-search",
  run(ctx) {
    ctx.run("node", ["scripts/verify-parts-master-data-suppress-toolbar-search.mjs"]);
  },
};
