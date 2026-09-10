export default {
  name: "verify:factoring-report-date-filters",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-report-date-filters.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factoring-report-date-filters.mjs"]);
  },
};
