export default {
  name: "verify-saf-cert-expiry-query-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-cert-expiry-query-error-surface.mjs"]);
    // BANK-F91209 piggyback — MedicalCardsHistory / CertExpiryBadge / DriverSchedulerGrid leftover slate refuse
    await ctx.run("node", ["scripts/verify-safety-med-cert-sched-slate-leftover-chrome.mjs"]);
  },
};
