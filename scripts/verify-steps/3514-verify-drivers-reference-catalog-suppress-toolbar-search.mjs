export default {
  name: "verify-drivers-reference-catalog-suppress-toolbar-search",
  run(ctx) {
    ctx.run("node", ["scripts/verify-drivers-reference-catalog-suppress-toolbar-search.mjs"]);
  },
};
