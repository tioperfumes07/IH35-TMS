export default {
  name: "verify-reports-scheduled-panel-canonical-source",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-reports-scheduled-panel-canonical-source.mjs"]) !== 0) {
      throw new Error("verify-reports-scheduled-panel-canonical-source failed");
    }
  },
};
