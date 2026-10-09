export default {
  name: "verify-dispatch-assign-driver-honest-label",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-assign-driver-honest-label.mjs"]);
    // BANK-F91144 piggy — DvirMaintenance/FuelCards/UnitDefaultDrivers slate leftover refuse
    await ctx.run("node", ["scripts/verify-91144-dvir-fuel-unitdrv-slate-leftover-chrome.mjs"]);
  },
};
