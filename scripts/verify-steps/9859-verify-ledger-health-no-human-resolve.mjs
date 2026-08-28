// verify-steps wrapper for scripts/verify-ledger-health-no-human-resolve.mjs — enforces that
// _system.reconciliation_findings (the table the Ledger Health dashboard reads) has no human-facing
// resolve/acknowledge/suppress route anywhere in the backend; findings self-close via the automated
// reconciliation-worker.service.ts re-detection pass only. Static, no DB.
export default {
  name: "verify-ledger-health-no-human-resolve",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ledger-health-no-human-resolve.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ledger-health-no-human-resolve.mjs"]);
  },
};
