export default {
  name: "verify-insurance-policy-unit-honest-label",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-insurance-policy-unit-honest-label.mjs"]);
    // BANK leftover refuse — FreshnessIndicator / CustomerLoadTemplates / EntityLink house tokens
    await ctx.run("node", ["scripts/verify-91294-fresh-tmpl-elink-slate-leftover-chrome.mjs"]);
  },
};
