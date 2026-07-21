export default {
  name: "verify:user-activity-tab-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-user-activity-tab-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-user-activity-tab-uses-paritytable.mjs"]);
  },
};
