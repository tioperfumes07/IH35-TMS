export default {
  name: "verify:unit-lifecycle-audit-company-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-unit-lifecycle-audit-company-scope.mjs"]);
  },
};
