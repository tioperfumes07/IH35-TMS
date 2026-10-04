export default {
  name: "verify:qbo-conflict-detection-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-conflict-detection-tenant-scope.mjs"]);
  },
};
