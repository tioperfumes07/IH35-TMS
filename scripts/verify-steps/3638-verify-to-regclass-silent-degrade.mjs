// verify-steps wrapper — CLS-LATCH-TABLE-ABSENT-SILENT-DEGRADE · claim 3638
export default {
  name: "verify-to-regclass-silent-degrade",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-to-regclass-silent-degrade.mjs"]);
    await ctx.run("node", ["scripts/verify-regclass-fallback-intent.mjs"]);
    await ctx.run("node", ["scripts/verify-91058-bills-ledger-finance-slate-leftover-chrome.mjs"]);
  },
};
