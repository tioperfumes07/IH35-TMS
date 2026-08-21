// CODEX-REVERSE-CONNECTIVITY-ORPHAN-GUARD-REGISTRY-BATCH
// Executes the ten leaf-specific reverse_link/connectivity and supporting mechanical ratchets.
// Rule 37 claim 4184 landed on main in PR #13250 before this wrapper was authored.
const GUARDS = [
  "verify-bill-detail-linked-identity-human-labels.mjs",
  "verify-bill-payment-bank-account-human-label.mjs",
  "verify-factor-reconciliation-invoice-human-label.mjs",
  "verify-insurance-claims-tombstone-safe-drills.mjs",
  "verify-invoices-list-filter-apply-single-write.mjs",
  "verify-legal-template-audit-actor-tombstone.mjs",
  "verify-linked-bank-transactions-panel-scope.mjs",
  "verify-maintenance-damage-register-tombstones.mjs",
  "verify-matrix-endpoint-hard-throttle.mjs",
  "verify-no-execsync-on-request-path.mjs",
  "verify-safety-integrity-alert-subject-tombstones.mjs",
  "verify-task-link-activity-event.mjs",
  "verify-trip-profitability-tombstone-drills.mjs",
];

export default {
  name: "verify-codex-reverse-connectivity-orphan-guard-registry-batch",
  run(ctx) {
    for (const guard of GUARDS) {
      ctx.run("node", [`scripts/${guard}`, "--selftest"]);
      ctx.run("node", [`scripts/${guard}`]);
    }
  },
};
