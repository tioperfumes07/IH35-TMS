// verify-steps wrapper for scripts/verify-ar-invoice-list-open-excludes-void.mjs (ACCT-F5027, step 3220).
export default {
  name: "verify-ar-invoice-list-open-excludes-void",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-ar-invoice-list-open-excludes-void.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-ar-invoice-list-open-excludes-void.mjs"]);
    // BANK-F91157 piggy — Onboarding Medical/Identity/DqfDocs slate leftover refuse
    await ctx.run("node", ["scripts/verify-91157-drv-onboard-slate-leftover-chrome.mjs"]);
  },
};
