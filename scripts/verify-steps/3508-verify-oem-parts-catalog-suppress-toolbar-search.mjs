export default {
  name: "verify-oem-parts-catalog-suppress-toolbar-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-oem-parts-catalog-suppress-toolbar-search.mjs"]);
    // BANK leftover refuse — plannerTimeAxis/AssignDriverDropdown/AuditEventsList house tokens
    await ctx.run("node", ["scripts/verify-planner-assign-audit-slate-leftover-chrome.mjs"]);
  },
};
