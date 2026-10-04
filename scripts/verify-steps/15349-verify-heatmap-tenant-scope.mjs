export default {
  name: "verify:heatmap-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-heatmap-tenant-scope.mjs"]);
  },
};
