export default {
  name: "verify-subscription-manager-delivery-banner",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-subscription-manager-delivery-banner.mjs"]) !== 0) {
      throw new Error("verify-subscription-manager-delivery-banner failed");
    }
  },
};
