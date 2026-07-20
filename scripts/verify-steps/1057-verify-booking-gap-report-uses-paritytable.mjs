export default {
  name: "verify:booking-gap-report-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-booking-gap-report-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-booking-gap-report-uses-paritytable.mjs"]);
  },
};
