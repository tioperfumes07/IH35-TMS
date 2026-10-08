export default {
  name: "verify-reports-booking-gap-staged-period-filter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-booking-gap-staged-period-filter.mjs"]);
    // BANK-F91200 piggyback — SessionDetail / BookingGap / UserProfile leftover slate refuse
    await ctx.run("node", ["scripts/verify-session-gap-profile-slate-leftover-chrome.mjs"]);
  },
};
