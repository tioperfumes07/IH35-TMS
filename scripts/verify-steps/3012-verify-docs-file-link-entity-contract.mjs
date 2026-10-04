export default {
  name: "verify-docs-file-link-entity-contract",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-docs-file-link-entity-contract.mjs"]);
    // BANK-F91464 — maint file_links work_order + engines widget (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-maint-filelinks-engine-widget.mjs", "--selftest"]);
  },
};
