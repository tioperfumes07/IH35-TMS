// Rule 17: auto-discovered verify-step. Do NOT edit package.json / locked-guards / ci.yml.
export default {
  name: "verify-report-refresh-no-nplus1",
  run(ctx) {
    const status = ctx.runAllowFailure("node", ["scripts/verify-report-refresh-no-nplus1.mjs"]);
    if (status !== 0) {
      throw new Error(`verify-report-refresh-no-nplus1 failed with status ${status}`);
    }
  },
};
