// Step 1743 — dashboard/KPI counts over maintenance.work_orders must exclude voided rows.
// Prod: Home reported "WOS OPEN: 2" when both rows were voided demo records.
export default {
  name: "verify:work-order-queries-exclude-voided",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-work-order-queries-exclude-voided.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-work-order-queries-exclude-voided.mjs"]);
  },
};
