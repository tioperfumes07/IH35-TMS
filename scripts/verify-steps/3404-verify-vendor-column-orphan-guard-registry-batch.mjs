const guards = [
  "verify-vendor-column-guard-registry-batch.mjs",
  "verify-insurance-policy-vendor-reverse.mjs", "verify-inventory-vendor-parts.mjs",
  "verify-legal-vendor-contract-reverse.mjs", "verify-legal-vendor-signer-creators.mjs",
  "verify-lists-vendor-search-and-create.mjs", "verify-maintenance-vendor-ap-reverse.mjs",
  "verify-maintenance-vendor-wiring.mjs", "verify-parts-inventory-vendor-reverse.mjs",
  "verify-vendor-detail-page-self-referential.mjs", "verify-vendor-inline-surface-linkage.mjs",
  "verify-vendor-master-detail-reverse-link.mjs", "verify-vendor-parts-history-linkage.mjs",
  "verify-vendor-preferred-parts-linkage.mjs", "verify-vendors-list-master-detail.mjs",
  "verify-vendors-reverse-link-detail-ap.mjs",
];

export default {
  name: "verify-vendor-column-orphan-guard-registry-batch",
  async run(ctx) { for (const guard of guards) await ctx.run("node", [`scripts/${guard}`]); },
};
