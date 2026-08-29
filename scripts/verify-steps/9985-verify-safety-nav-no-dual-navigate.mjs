// SafetyGroupNav's NavLink + SafetyLayout's onTabChange both called navigate() to the same target
// on one click, racing React Router and leaving a stale driver-detail view stuck on screen under
// the new URL. Step 9985 · CC-3 lane.
export default {
  name: "safety-nav-no-dual-navigate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-nav-no-dual-navigate.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-safety-nav-no-dual-navigate.mjs"]);
  },
};
