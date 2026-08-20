const guards = [
  "verify-nonmoney-residual-linkage-guard-registry-batch.mjs",
  "verify-dispatch-required-scenario-maint-honest.mjs",
  "verify-dispatch-reverse-link-queues.mjs",
  "verify-existing-fk-reverse-drills.mjs",
  "verify-inventory-inline-surface-applicability.mjs",
  "verify-safety-profile-error-contract.mjs",
  "verify-work-order-col-remainder.mjs",
  "verify-accounting-credit-memos-connectivity-reverse.mjs",
];

export default {
  name: "verify-nonmoney-residual-linkage-orphan-guard-registry-batch",
  async run(ctx) {
    for (const guard of guards) await ctx.run("node", [`scripts/${guard}`]);
  },
};
