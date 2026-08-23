export default {
  name: "verify:customer-quality-events-company-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-quality-events-company-scope.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customer-quality-events-company-scope.mjs"]);
  },
};
