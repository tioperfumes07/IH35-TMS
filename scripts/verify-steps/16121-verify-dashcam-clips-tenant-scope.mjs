export default {
  name: "verify:dashcam-clips-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dashcam-clips-tenant-scope.mjs"]);
  },
};
