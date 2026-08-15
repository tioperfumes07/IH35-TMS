export default {
  name: "verify-maintenance-services-catalog-suppress-toolbar-search",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-services-catalog-suppress-toolbar-search.mjs"]);
  },
};
