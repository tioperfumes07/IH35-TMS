const guards = [
  "verify-nonmoney-connectivity-guard-registry-batch.mjs",
  "verify-inventory-purchase-hold-connectivity.mjs",
  "verify-maintenance-damage-intake-connectivity.mjs",
  "verify-maintenance-severe-repair-connectivity.mjs",
  "verify-maintenance-tire-creators-connectivity.mjs",
  "verify-maintenance-work-order-create-modal-connectivity.mjs",
  "verify-reports-detention-claims-connectivity.mjs",
  "verify-reports-dot-audit-pack-connectivity.mjs",
  "verify-reports-fleet-utilization-connectivity.mjs",
  "verify-reports-fuel-price-variance-connectivity.mjs",
  "verify-reports-hos-violations-connectivity.mjs",
  "verify-reports-hub-connectivity.mjs",
  "verify-reports-runner-canonical-aliases.mjs",
  "verify-reports-saved-preset-connectivity.mjs",
  "verify-safety-eld-audit-connectivity.mjs",
  "verify-system-program-config-connectivity.mjs",
];

export default {
  name: "verify-nonmoney-connectivity-orphan-guard-registry-batch",
  async run(ctx) {
    for (const guard of guards) await ctx.run("node", [`scripts/${guard}`]);
  },
};
