export default {
  name: "verify:vehicle-recent-activity-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vehicle-recent-activity-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-vehicle-recent-activity-uses-paritytable.mjs"]);
  },
};
