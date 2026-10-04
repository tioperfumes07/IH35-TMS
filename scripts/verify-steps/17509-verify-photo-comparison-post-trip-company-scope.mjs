export default {
  name: "verify:photo-comparison-post-trip-company-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-photo-comparison-post-trip-company-scope.mjs"]);
  },
};
