// verify-datepicker-company-tz-residual — §9.0 item 17 pattern sweep
export default {
  name: "verify:datepicker-company-tz-residual",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-datepicker-company-tz-residual.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-datepicker-company-tz-residual.mjs"]);
  },
};
