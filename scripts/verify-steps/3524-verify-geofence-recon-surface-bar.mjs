/** Verify-step 3524 — RPT-F3524 geofence recon always-mount ParityTable surface bar. */
export default {
  name: "verify-geofence-recon-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-geofence-recon-surface-bar.mjs"]);
  },
};
