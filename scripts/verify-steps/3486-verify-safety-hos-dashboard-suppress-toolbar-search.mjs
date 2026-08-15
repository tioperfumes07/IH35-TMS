export default {
  name: "verify-safety-hos-dashboard-suppress-toolbar-search",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-hos-dashboard-suppress-toolbar-search.mjs"]);
  },
};
