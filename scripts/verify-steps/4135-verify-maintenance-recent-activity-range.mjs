export default {
  name: "verify:maintenance-recent-activity-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-recent-activity-range.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-maintenance-recent-activity-range.mjs"]);
  },
};
