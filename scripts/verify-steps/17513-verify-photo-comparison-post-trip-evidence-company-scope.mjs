export default {
  name: "verify:photo-comparison-post-trip-evidence-company-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-photo-comparison-post-trip-evidence-company-scope.mjs"]);
  },
};
