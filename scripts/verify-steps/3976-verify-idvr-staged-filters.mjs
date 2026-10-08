export default {
  name: "verify-idvr-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-idvr-staged-filters.mjs"]);
    // BANK-F91214 piggyback — IdvrPage / CompanyViolationsPage / EscrowForfeitModal leftover slate refuse
    await ctx.run("node", ["scripts/verify-idvr-coviol-escrow-slate-leftover-chrome.mjs"]);
  },
};
