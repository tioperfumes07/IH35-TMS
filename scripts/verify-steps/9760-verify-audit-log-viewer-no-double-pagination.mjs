export default {
  name: "verify-audit-log-viewer-no-double-pagination",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-audit-log-viewer-no-double-pagination.mjs"]) !== 0) {
      throw new Error("verify-audit-log-viewer-no-double-pagination failed");
    }
  },
};
