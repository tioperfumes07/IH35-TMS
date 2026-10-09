export default {
  name: "verify-surface-bar-modal-inventory",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-surface-bar-modal-inventory.mjs"]);
    // BANK-F91152 piggy — UnitTires/PmSchedule/SevereRepair slate leftover refuse
    await ctx.run("node", ["scripts/verify-91152-maint-tires-pm-severe-slate-leftover-chrome.mjs"]);
  },
};
