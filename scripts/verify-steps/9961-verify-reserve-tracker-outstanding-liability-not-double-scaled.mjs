// Reserve Tracker's Outstanding Liability KPI double-scaled an already-dollar API field through the
// cents-dividing fmtM(), showing $18.50 instead of the real $1,850.00. Step 9961 · CC-3 lane.
export default {
  name: "reserve-tracker-outstanding-liability-not-double-scaled",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reserve-tracker-outstanding-liability-not-double-scaled.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-reserve-tracker-outstanding-liability-not-double-scaled.mjs"]);
  },
};
