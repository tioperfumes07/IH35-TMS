export default {
  name: "verify:driver-rate-effective-date-company-business-date",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-rate-effective-date-company-business-date.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-rate-effective-date-company-business-date.mjs"]);
  },
};
