// CLS-RAW-UUID-LABEL — WOTimeTrackingPanel labor code labels (verify-step 2318 · Cursor EVEN band).
export default {
  name: "wo-time-tracking-no-raw-uuid",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-wo-time-tracking-no-raw-uuid.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-wo-time-tracking-no-raw-uuid.mjs"]);
  },
};
