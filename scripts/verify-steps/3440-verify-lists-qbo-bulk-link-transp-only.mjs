/** Verify-step 3440 — Lists QBO bulk-link TRANSP-only (LV-LISTS-USMCA-QBO-BULK-LINK). */
export default {
  name: "verify-lists-qbo-bulk-link-transp-only",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lists-qbo-bulk-link-transp-only.mjs"]);
  },
};
