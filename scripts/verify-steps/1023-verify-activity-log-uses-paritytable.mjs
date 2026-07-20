export default {
  name: "verify:activity-log-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-activity-log-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-activity-log-uses-paritytable.mjs"]);
  },
};
