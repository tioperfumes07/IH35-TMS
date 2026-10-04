export default {
  name: "verify-saf-damage-report-detail-query-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-damage-report-detail-query-error-surface.mjs"]);
    // BANK-F91503 — TruckLine Status leftover fontSize: 11 refuse (11413 is ODD; leftover now on this EVEN host).
    // BANK-F91525 — leftover Clear-button border-[#CBD5E1] → house #E5E7EB (SVG fill stays locked).
    await ctx.run("node", ["scripts/verify-truck-line-units-only.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-truck-line-units-only.mjs"]);
  },
};
