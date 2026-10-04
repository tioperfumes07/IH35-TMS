// BANK-F91520: leftover HOS status-dot #94A3B8 muted; leftover refuse --selftest + live
// BANK-F91536: leftover Tailwind slate-* classes → house #1F2A44 / #0F1219 / #4B5563 / #E5E7EB / #F7F8FA
export default {
  name: "verify-hos-tracker-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-hos-tracker-staged-filters.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-hos-tracker-staged-filters.mjs"]);
  },
};
