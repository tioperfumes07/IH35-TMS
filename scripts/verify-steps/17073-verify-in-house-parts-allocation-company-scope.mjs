export default {
  name: "verify:in-house-parts-allocation-company-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-in-house-parts-allocation-company-scope.mjs"]);
  },
};
