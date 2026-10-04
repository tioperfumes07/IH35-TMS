export default {
  name: "verify:driver-reference-enrichment-company-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-reference-enrichment-company-scope.mjs"]);
  },
};
