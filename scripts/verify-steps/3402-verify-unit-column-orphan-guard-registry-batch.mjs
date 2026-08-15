const guards = [
  "verify-unit-column-guard-registry-batch.mjs",
  "verify-border-crossing-unit-linkage.mjs", "verify-compliance-tax-filings-unit-reverse.mjs",
  "verify-compliance-unit-wiring.mjs", "verify-default-truck-unit-reverse.mjs",
  "verify-dispatch-unit-wiring.mjs", "verify-docs-unit-wiring.mjs",
  "verify-fleet-unit-profile-edit-detail.mjs", "verify-fleet-unit-roster-modals.mjs",
  "verify-hos-unit-entitylink.mjs", "verify-insurance-policy-unit-double-route.mjs",
  "verify-insurance-unit-wiring.mjs", "verify-intransit-issue-unit-linkage.mjs",
  "verify-legal-matter-unit-linkage.mjs", "verify-load-create-modal-asset-unit-link.mjs",
  "verify-maintenance-inspection-unit-linkage.mjs", "verify-maintenance-unit-wiring.mjs",
  "verify-pm-schedule-unit-linkage.mjs", "verify-quick-assign-unit-linkage.mjs",
  "verify-reports-unit-wiring.mjs", "verify-safety-permit-unit-picker.mjs",
  "verify-safety-permit-unit-reverse.mjs", "verify-safety-unit-wiring.mjs",
  "verify-severe-repair-unit-reverse.mjs", "verify-tasks-unit-wiring.mjs",
  "verify-temp-cover-unit-linkage.mjs", "verify-tire-program-unit-reverse.mjs",
  "verify-unit-hidden-surface-reverse-links.mjs", "verify-unit-inline-surface-linkage.mjs",
  "verify-unit-oem-reference-applicability.mjs", "verify-unit-task-reverse-drill.mjs",
];

export default {
  name: "verify-unit-column-orphan-guard-registry-batch",
  async run(ctx) {
    for (const guard of guards) await ctx.run("node", [`scripts/${guard}`]);
  },
};
