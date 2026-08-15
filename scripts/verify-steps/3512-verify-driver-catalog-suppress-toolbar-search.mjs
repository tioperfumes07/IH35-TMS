export default {
  name: "verify-driver-catalog-suppress-toolbar-search",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-catalog-suppress-toolbar-search.mjs"]);
  },
};
