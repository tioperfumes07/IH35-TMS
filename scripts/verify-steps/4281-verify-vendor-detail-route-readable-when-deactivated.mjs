export default {
  name: "verify:vendor-detail-route-readable-when-deactivated",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendor-detail-route-readable-when-deactivated.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-vendor-detail-route-readable-when-deactivated.mjs"]);
  },
};
