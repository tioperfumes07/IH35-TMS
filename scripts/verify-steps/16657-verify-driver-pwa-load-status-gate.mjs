export default {
  name: "verify:driver-pwa-load-status-gate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-pwa-load-status-gate.mjs"]);
  },
};
