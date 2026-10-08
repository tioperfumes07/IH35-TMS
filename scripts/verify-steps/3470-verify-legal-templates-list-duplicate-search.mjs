export default {
  name: "verify-legal-templates-list-duplicate-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-legal-templates-list-duplicate-search.mjs"]);
    // BANK-F91203 piggyback — LegalTemplates / TermsOfService / PrivacyPolicy leftover slate refuse
    await ctx.run("node", ["scripts/verify-legal-tos-privacy-slate-leftover-chrome.mjs"]);
  },
};
