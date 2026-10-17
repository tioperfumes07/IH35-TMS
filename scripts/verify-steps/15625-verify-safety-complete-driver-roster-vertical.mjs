export default {
  name: "verify:safety-complete-driver-roster-vertical",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-complete-driver-roster-vertical.mjs"]);
    // LEAD 14:30Z: the Truck Planner roster guard (imported by this chain) had a dead --selftest plant and nothing ran its
    // selftest — run it here so a planted defect that survives fails the build.
    ctx.run("node", ["scripts/verify-truck-planner-complete-unit-roster.mjs", "--selftest"]);
  },
};
