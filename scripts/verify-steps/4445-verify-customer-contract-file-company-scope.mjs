export default {
  name: "verify:customer-contract-file-company-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-contract-file-company-scope.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customer-contract-file-company-scope.mjs"]);
  },
};
