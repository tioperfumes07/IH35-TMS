export default {
  name: "verify:driver-pwa-shared-dispatch-view",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-pwa-shared-dispatch-view.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-pwa-shared-dispatch-view.mjs"]);
  },
};
