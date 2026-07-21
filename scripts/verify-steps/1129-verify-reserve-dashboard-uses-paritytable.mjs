export default {
  name: "verify:reserve-dashboard-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reserve-dashboard-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-reserve-dashboard-uses-paritytable.mjs"]);
  },
};
