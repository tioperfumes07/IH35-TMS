export default {
  name: "verify:customer-lifecycle-selected-company-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-lifecycle-selected-company-scope.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customer-lifecycle-selected-company-scope.mjs"]);
  },
};
