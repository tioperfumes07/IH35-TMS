/**
 * LV-CODEX-SHIPPED-GUARDS-ORPHANED-FROM-CI
 *
 * Keep the four ratchets shipped in Codex PRs #7938, #7939, #7940, and #7942
 * on the required verify-step path. Each underlying guard owns its planted
 * defect self-test; verify-guard-wired independently rejects removal of any
 * invocation below.
 *
 * @type {import("./_context.mjs").VerifyStep}
 */
export default {
  name: "verify-codex-four-shipped-guards-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-maint-past-due-kpi-source.mjs"]);
    await ctx.run("node", ["scripts/verify-inventory-purchase-history-creator-route.mjs"]);
    await ctx.run("node", ["scripts/verify-insurance-claims-filter-apply.mjs"]);
    await ctx.run("node", ["scripts/verify-maintenance-integration-strip-capability.mjs"]);
  },
};
