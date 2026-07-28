// Rule 17 — BANK-F09 deep-wizard DoD structural guard (verify-steps only).
export default {
  name: "bank-f09-settings-reports-email-queue",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-bank-f09-settings-reports-email-queue.mjs", "--selftest"]) !== 0) {
      return 1;
    }
    if (ctx.run("node", ["scripts/verify-bank-f09-settings-reports-email-queue.mjs"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
