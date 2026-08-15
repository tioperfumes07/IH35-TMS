export default {
  name: "verify-drivers-master-data-suppress-toolbar-search",
  run(ctx) {
    ctx.run("node", ["scripts/verify-drivers-master-data-suppress-toolbar-search.mjs"]);
  },
};
