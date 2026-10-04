export default {
  name: "verify:arrival-detection-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-arrival-detection-tenant-scope.mjs"]);
  },
};
