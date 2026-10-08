/** @type {import("./_context.mjs").VerifyStep} */
export default {
  name: "verify-fleettable-unit-cell-maintenance-mode",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fleettable-unit-cell-maintenance-mode.mjs"]);
    // BANK-F91207 piggyback — FleetTable / RoadService / InventoryPartsStock leftover slate refuse
    await ctx.run("node", ["scripts/verify-fleet-road-inv-slate-leftover-chrome.mjs"]);
  },
};
