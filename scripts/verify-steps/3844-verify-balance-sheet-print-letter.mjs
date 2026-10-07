export default {
  name: "verify-balance-sheet-print-letter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-balance-sheet-print-letter.mjs"]);
    // BANK leftover refuse — BalanceSheet/ProfitLoss/LoginReset house tokens
    await ctx.run("node", ["scripts/verify-bs-pl-login-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bs-pl-login-slate-leftover-chrome.mjs"]);
  },
};
