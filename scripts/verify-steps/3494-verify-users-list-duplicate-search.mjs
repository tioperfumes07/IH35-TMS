export default {
  name: "verify-users-list-duplicate-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-users-list-duplicate-search.mjs"]);
    // BANK leftover refuse — Login/HelpCenter/LoadTemplateLibrary house tokens
    await ctx.run("node", ["scripts/verify-login-help-tmpl-slate-leftover-chrome.mjs"]);
  },
};
