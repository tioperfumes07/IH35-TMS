// SAF-B31 export honesty — XLSX must mirror scoped rollup rows; selftest plants safety.sample first.
export default {
  name: "verify:saf-b31-safety-report-export-honesty",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-b31-safety-report-export-honesty.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-saf-b31-safety-report-export-honesty.mjs"]);
  },
};
