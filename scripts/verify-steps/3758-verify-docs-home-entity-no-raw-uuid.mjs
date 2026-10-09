export default {
  name: "verify-docs-home-entity-no-raw-uuid",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-docs-home-entity-no-raw-uuid.mjs"]);
    await ctx.run("node", ["scripts/verify-91090-alloc-disputes-recurbill-slate-leftover-chrome.mjs"]);
  },
};
