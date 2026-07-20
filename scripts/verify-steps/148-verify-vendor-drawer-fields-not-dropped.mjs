export default {
  name: "verify-vendor-drawer-fields-not-dropped",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendor-drawer-fields-not-dropped.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-vendor-drawer-fields-not-dropped.mjs"]);
  },
};
