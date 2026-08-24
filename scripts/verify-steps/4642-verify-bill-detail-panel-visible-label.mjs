export default {
  name: "verify-bill-detail-panel-visible-label",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-bill-detail-panel-visible-label.mjs"]) !== 0) {
      throw new Error("verify-bill-detail-panel-visible-label failed");
    }
  },
};
