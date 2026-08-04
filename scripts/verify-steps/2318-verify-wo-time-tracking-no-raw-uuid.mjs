// CLS-RAW-UUID-LABEL — WOTimeTrackingPanel labor code labels (verify-step 2318 · Cursor EVEN band).
export default {
  name: "wo-time-tracking-no-raw-uuid",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-wo-time-tracking-no-raw-uuid.mjs", "--selftest"]).then(() =>
      ctx.run("node", ["scripts/verify-wo-time-tracking-no-raw-uuid.mjs"]),
    );
  },
};
