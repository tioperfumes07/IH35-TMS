// GUARD — DriverScoreDetail box-in-box flatten (verify-step 2342 · Cursor EVEN band).
export default {
  name: "driver-score-detail-no-box-in-box",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-score-detail-no-box-in-box.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-driver-score-detail-no-box-in-box.mjs"]);
  },
};
