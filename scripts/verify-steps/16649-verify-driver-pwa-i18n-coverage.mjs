export default {
  name: "verify:driver-pwa-i18n-coverage",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-pwa-i18n-coverage.mjs"]);
  },
};
