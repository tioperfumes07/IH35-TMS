export default {
  name: "verify:financial-reports-business-date-not-utc",
  run(ctx) {
    ctx.run("node", ["scripts/verify-financial-reports-business-date-not-utc.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-financial-reports-business-date-not-utc.mjs"]);
  },
};
