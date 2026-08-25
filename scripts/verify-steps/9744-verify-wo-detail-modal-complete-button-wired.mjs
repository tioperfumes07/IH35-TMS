export default {
  name: "verify-wo-detail-modal-complete-button-wired",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-wo-detail-modal-complete-button-wired.mjs"]) !== 0) {
      throw new Error("verify-wo-detail-modal-complete-button-wired failed");
    }
  },
};
