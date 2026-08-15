export default {
  name: "verify-qbo-sync-dashboard-suppress-toolbar-search",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-sync-dashboard-suppress-toolbar-search.mjs"]);
  },
};
