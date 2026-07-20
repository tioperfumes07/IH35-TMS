export default {
  name: "verify:error-monitor-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-error-monitor-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-error-monitor-uses-paritytable.mjs"]);
  },
};
