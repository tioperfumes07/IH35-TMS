// CODEX-CUSTOMER-DRIVER-CONNECTIVITY-GUARD-REGISTRY-BATCH
// Rule 37 claim 8924 landed on origin/main in PR #15663 before this wrapper was authored.
//
// These guards protect canonical customer/driver reads and mutation error truth. Running both
// their planted-defect selftests and normal checks keeps shipped connectivity from silently
// regressing while preserving leaf-specific ownership in the individual guard files.
const GUARDS = [
  "verify-customer-activity-feed-wired.mjs",
  "verify-customer-contact-visible-errors.mjs",
  "verify-customer-lane-visible-errors.mjs",
  "verify-customer-notes-tab-wired.mjs",
  "verify-customer-quality-event-visible-errors.mjs",
  "verify-driver-applicant-mutation-errors.mjs",
  "verify-driver-detail-catalog-failure-truth.mjs",
  "verify-driver-dqf-visible-errors.mjs",
  "verify-driver-load-status-visible-errors.mjs",
  "verify-driver-message-read-visible-errors.mjs",
  "verify-driver-prompt-visible-errors.mjs",
  "verify-driver-push-registration-errors.mjs",
  "verify-driver-qualification-rate-change-scope.mjs",
  "verify-driver-scheduler-request-detail-failure-truth.mjs",
];

export default {
  name: "verify-codex-customer-driver-connectivity-guard-registry-batch",
  run(ctx) {
    for (const guard of GUARDS) {
      ctx.run("node", [`scripts/${guard}`, "--selftest"]);
      ctx.run("node", [`scripts/${guard}`]);
    }
  },
};
