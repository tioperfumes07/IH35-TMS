export default {
  name: "verify:dashcam-rbac-restrict",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dashcam-rbac-restrict.mjs"]);
  },
};
