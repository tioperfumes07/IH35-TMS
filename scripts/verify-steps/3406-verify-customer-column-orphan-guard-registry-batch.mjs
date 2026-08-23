const guards = [
  "verify-customer-column-guard-registry-batch.mjs",
  "verify-cargo-claim-customer-reverse.mjs", "verify-cashflow-predicted-customer-entitylink.mjs",
  "verify-customer-detail-page-self-referential.mjs", "verify-customer-entity-picker-kind.mjs",
  "verify-customer-inline-surface-linkage.mjs", "verify-customer-notify-linkage.mjs",
  "verify-customer-reclassification-history-scope.mjs",
  "verify-customer-reverse-link-wired.mjs", "verify-customers-list-master-detail.mjs",
  "verify-customers-reverse-link-detail.mjs", "verify-dispatch-customer-queues-and-load-drawer.mjs",
  "verify-legal-customer-contract-reverse.mjs", "verify-lists-customer-search-and-create.mjs",
  "verify-load-template-customer-reverse.mjs", "verify-planner-calendar-customer-entitylink.mjs",
];
export default {
  name: "verify-customer-column-orphan-guard-registry-batch",
  async run(ctx) { for (const guard of guards) await ctx.run("node", [`scripts/${guard}`]); },
};
