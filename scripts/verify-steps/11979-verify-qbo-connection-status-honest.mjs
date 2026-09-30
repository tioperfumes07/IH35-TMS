/**
 * ROUND 300 B-35 (Lead order): established what USMCA's "QBO Sync: Not connected" state actually
 * means. This locks that TRANSP/TRK's own live connections stay healthy, without treating
 * USMCA's by-design disconnection as a defect. Verify-step 11979, CC-2 band (mod-4 ≡3).
 */
export default {
  name: "verify-qbo-connection-status-honest",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-qbo-connection-status-honest.mjs"]);
  },
};
