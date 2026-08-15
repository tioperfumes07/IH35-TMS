const guards = [
  "verify-cursor-picker-chrome-orphan-guard-registry-batch.mjs",
  "verify-collapsed-list-filters-apply.mjs",
  "verify-dispatch-picker-law-queues.mjs",
  "verify-factoring-qbo-chrome-surfaces.mjs",
  "verify-fleet-picker-law-edit.mjs",
  "verify-liability-chrome-honest-2.mjs",
  "verify-maintenance-picker-law-queues.mjs",
  "verify-picker-law-built-match-cap.mjs",
  "verify-picker-law-remainder-batch.mjs",
  "verify-pm-alert-work-order-picker.mjs",
  "verify-safety-picker-law-lists.mjs",
  "verify-secondary-picker-law-batch.mjs",
  "verify-surface-bar-create-drawer-inventory.mjs",
  "verify-surface-bar-toolbar-leaf-inventory.mjs",
  "verify-surface-bar-wizard-inventory.mjs",
];

export default {
  name: "verify-cursor-picker-chrome-orphan-guard-registry-batch",
  async run(ctx) {
    for (const guard of guards) await ctx.run("node", [`scripts/${guard}`]);
  },
};
