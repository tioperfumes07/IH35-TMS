export default {
  name: "verify:drivers-pwa-live-data",
  run(ctx) {
    ctx.run("node", ["scripts/verify-drivers-pwa-live-data.mjs"]);
  },
};
