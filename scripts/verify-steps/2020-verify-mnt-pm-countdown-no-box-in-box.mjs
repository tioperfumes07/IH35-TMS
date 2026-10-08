// Maintenance PM Countdown — non-compact chrome must stay flat (verify-step 2020, Cursor EVEN band).
export default {
  name: "mnt-pm-countdown-no-box-in-box",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-mnt-pm-countdown-no-box-in-box.mjs"]);
    // BANK-F91217 piggyback — MaintenancePmCountdownCards / InTransitTriageBand / FaultDraftsPage leftover slate refuse
    await ctx.run("node", ["scripts/verify-maint-pm-transit-fault-slate-leftover-chrome.mjs"]);
  },
};
