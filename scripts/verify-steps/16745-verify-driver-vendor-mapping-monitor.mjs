export default {
  name: "verify:driver-vendor-mapping-monitor",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-vendor-mapping-monitor.mjs"]);
  },
};
