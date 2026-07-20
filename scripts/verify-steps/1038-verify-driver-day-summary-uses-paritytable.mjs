export default {
  name: "verify:driver-day-summary-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-day-summary-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-day-summary-uses-paritytable.mjs"]);
  },
};
