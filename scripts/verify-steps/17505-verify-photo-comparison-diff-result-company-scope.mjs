export default {
  name: "verify:photo-comparison-diff-result-company-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-photo-comparison-diff-result-company-scope.mjs"]);
  },
};
