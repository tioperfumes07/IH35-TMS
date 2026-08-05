// Scenario tracker must bind to LIVE data and must never count QuickBooks-imported rows as proof a
// TMS flow works. Step 2533 · CC-1 lane (n%4==1), claimed on main by #4357.
export default {
  name: "scenario-tracker-live-binding",
  run(ctx) {
    ctx.run("node", ["scripts/verify-scenario-tracker-live-binding.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-scenario-tracker-live-binding.mjs"]);
  },
};
