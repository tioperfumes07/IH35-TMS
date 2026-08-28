export default {
  name: "verify:lane-profitability-monthly-refresh-no-silent-catch",
  run(ctx) {
    ctx.run("node", ["scripts/verify-lane-profitability-monthly-refresh-no-silent-catch.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-lane-profitability-monthly-refresh-no-silent-catch.mjs"]);
  },
};
