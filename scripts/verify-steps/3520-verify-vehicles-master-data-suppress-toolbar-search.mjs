export default {
  name: "verify-vehicles-master-data-suppress-toolbar-search",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vehicles-master-data-suppress-toolbar-search.mjs"]);
  },
};
