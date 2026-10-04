export default {
  name: "verify:dvir-submit-audit-company-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dvir-submit-audit-company-scope.mjs"]);
  },
};
