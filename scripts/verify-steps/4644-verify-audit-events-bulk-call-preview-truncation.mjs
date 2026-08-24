export default {
  name: "verify-audit-events-bulk-call-preview-truncation",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-audit-events-bulk-call-preview-truncation.mjs"]) !== 0) {
      throw new Error("verify-audit-events-bulk-call-preview-truncation failed");
    }
  },
};
