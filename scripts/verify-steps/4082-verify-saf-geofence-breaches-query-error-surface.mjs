export default {
  name: "verify-saf-geofence-breaches-query-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-geofence-breaches-query-error-surface.mjs"]);
    // BANK leftover slate refuse piggyback (F91184)
    await ctx.run("node", ["scripts/verify-geofence-anom-dot-slate-leftover-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-geofence-anom-dot-slate-leftover-chrome.mjs"]);
  },
};
