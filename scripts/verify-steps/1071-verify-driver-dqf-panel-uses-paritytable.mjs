export default {
  name: "verify:driver-dqf-panel-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-dqf-panel-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-dqf-panel-uses-paritytable.mjs"]);
  },
};
