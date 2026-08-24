export default {
  name: "verify-audit-report-page-no-double-pagination",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-audit-report-page-no-double-pagination.mjs"]) !== 0) {
      throw new Error("verify-audit-report-page-no-double-pagination failed");
    }
  },
};
