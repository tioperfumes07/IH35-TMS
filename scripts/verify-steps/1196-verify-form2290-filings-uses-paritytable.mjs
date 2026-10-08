export default {
  name: "verify:form2290-filings-uses-paritytable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-form2290-filings-uses-paritytable.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-form2290-filings-uses-paritytable.mjs"]);
    // BANK-F91220 piggyback — HosHistorySection / Form2290Filings / UnitTaxFilingsReverseSection leftover slate refuse
    await ctx.run("node", ["scripts/verify-hos-form2290-unittax-slate-leftover-chrome.mjs"]);
  },
};
