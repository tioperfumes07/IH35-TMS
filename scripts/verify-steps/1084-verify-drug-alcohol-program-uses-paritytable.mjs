export default {
  name: "verify:drug-alcohol-program-uses-paritytable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-drug-alcohol-program-uses-paritytable.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-drug-alcohol-program-uses-paritytable.mjs"]);
    // BANK leftover refuse — DrugAlcohol / DailyTasks / LegalTemplateDetail house tokens
    await ctx.run("node", ["scripts/verify-drug-daily-legal-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-drug-daily-legal-slate-leftover-chrome.mjs"]);
  },
};
