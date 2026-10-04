// BANK-F91520: leftover HOS status-dot #94A3B8 muted; leftover refuse --selftest + live
export default {
  name: "verify-hos-tracker-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-hos-tracker-staged-filters.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-hos-tracker-staged-filters.mjs"]);
  },
};
