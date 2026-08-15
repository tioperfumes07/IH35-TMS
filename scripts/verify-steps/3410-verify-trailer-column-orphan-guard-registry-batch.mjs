const guards = [
  "verify-trailer-column-guard-registry-batch.mjs",
  "verify-dispatch-trailer-drawer-assign-transfer.mjs", "verify-equipment-transfer-trailer-linkage.mjs",
  "verify-fleet-roster-trailer-edit-and-transfer-link.mjs", "verify-fleet-roster-trailer-kind-wiring.mjs",
  "verify-fleet-trailer-modals-and-reefer.mjs", "verify-fuel-insurance-maintenance-trailer-create.mjs",
  "verify-legal-matter-trailer-linkage.mjs", "verify-quick-assign-trailer-linkage.mjs",
  "verify-safety-trailer-incident-wiring.mjs", "verify-trailer-oem-reference-applicability.mjs",
  "verify-trailer-profile-page-self-referential.mjs", "verify-trailer-tire-program-linkage.mjs",
];
export default { name: "verify-trailer-column-orphan-guard-registry-batch", async run(ctx) { for (const guard of guards) await ctx.run("node", [`scripts/${guard}`]); } };
