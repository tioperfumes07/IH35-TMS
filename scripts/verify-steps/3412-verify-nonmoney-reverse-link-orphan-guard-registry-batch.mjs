const guards = [
  "verify-nonmoney-reverse-link-guard-registry-batch.mjs",
  "verify-arriving-soon-work-order-reverse.mjs", "verify-border-crossing-broker-linkage.mjs",
  "verify-complaint-linkage.mjs", "verify-docs-module-reverse-link-wired.mjs",
  "verify-entity-tasks-reverse-leaves.mjs", "verify-equipment-transfer-human-label.mjs",
  "verify-fleet-trailer-transfer-record-reverse.mjs",
  "verify-fleet-reverse-link-remainder.mjs", "verify-fleet-reverse-link-transfers.mjs",
  "verify-geofence-entitylink-drill.mjs", "verify-hos-violation-linkage.mjs",
  "verify-inline-surface-connectivity-routes.mjs", "verify-insurance-coi-policy-reverse.mjs",
  "verify-insurance-lawsuit-policy-reverse.mjs", "verify-insurance-policy-reverse-leaves.mjs",
  "verify-insurance-profile-reverse.mjs", "verify-insurance-reverse-link-detail-surfaces.mjs",
  "verify-legal-fuel-reverse-link-remainder.mjs", "verify-legal-matter-claim-linkage.mjs",
  "verify-legal-matter-lawsuit-writer-reverse.mjs", "verify-lists-reverse-link-remainder.mjs",
  "verify-maintenance-hidden-surface-reverse-links.mjs", "verify-maintenance-reverse-link-remainder.mjs",
  "verify-maintenance-source-work-order-reverse.mjs", "verify-maintenance-work-order-entity-drills.mjs",
  "verify-master-detail-reverse-leaves.mjs", "verify-profile-report-safety-reverse-drills.mjs",
  "verify-reports-reverse-link-batch.mjs", "verify-roster-reverse-link-leaves.mjs",
  "verify-safety-alert-profile-reverse.mjs", "verify-safety-incidents-reverse-link-wired.mjs",
  "verify-safety-reverse-link-list-surfaces.mjs", "verify-secondary-reverse-link-batch.mjs",
  "verify-system-audit-record-reverse.mjs", "verify-user-reverse-link-detail-sweep.mjs",
  "verify-user-reverse-link-vertical-sweep.mjs", "verify-warranty-claim-linkage.mjs",
  "verify-work-order-parts-history-linkage.mjs",
];

export default {
  name: "verify-nonmoney-reverse-link-orphan-guard-registry-batch",
  async run(ctx) {
    for (const guard of guards) await ctx.run("node", [`scripts/${guard}`]);
  },
};
