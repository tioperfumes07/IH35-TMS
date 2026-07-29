// Step 1751 — FUEL-F01: Fuel KPI strip money figures (MTD Spend / Avg $/gal / MTD Savings) must
// render through a shared, grouping-capable formatter (toLocaleString/Intl.NumberFormat), not a
// bare toFixed() that drops thousands separators ("$54409" vs "$54,409").
// Rule 17: guards wire ONLY through scripts/verify-steps/NNNN-*.mjs.
export default {
  name: "verify-fuel-kpi-money-format",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fuel-kpi-money-format.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-fuel-kpi-money-format.mjs"]);
  },
};
