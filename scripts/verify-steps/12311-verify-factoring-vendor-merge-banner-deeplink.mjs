export default {
  name: "verify:factoring-vendor-merge-banner-deeplink",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-vendor-merge-banner-deeplink.mjs"]);
  },
};
