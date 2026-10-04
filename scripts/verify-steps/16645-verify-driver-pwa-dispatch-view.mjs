export default {
  name: "verify:driver-pwa-dispatch-view",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-pwa-dispatch-view.mjs"]);
  },
};
