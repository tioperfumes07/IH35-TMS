/** Verify-step 3448 — Lists hub QBO Sync Health TRANSP-only (LV-LISTS-USMCA-QBO-SYNC-HEALTH). */
export default {
  name: "verify-lists-hub-qbo-sync-transp-only",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lists-hub-qbo-sync-transp-only.mjs"]);
  },
};
