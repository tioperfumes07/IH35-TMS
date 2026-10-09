export default {
  name: "verify-nonmoney-exact-entity-nouns",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-nonmoney-exact-entity-nouns.mjs"]);
    // BANK-F91142 piggy — ListViewHeader/TableHeaderCell/ReportCategoryHoverNav slate leftover refuse
    await ctx.run("node", ["scripts/verify-91142-list-nav-slate-leftover-chrome.mjs"]);
  },
};
