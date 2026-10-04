export default {
  name: "verify:driver-pwa-incident-full",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-pwa-incident-full.mjs"]);
  },
};
