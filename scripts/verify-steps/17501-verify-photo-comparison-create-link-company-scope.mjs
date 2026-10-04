export default {
  name: "verify:photo-comparison-create-link-company-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-photo-comparison-create-link-company-scope.mjs"]);
  },
};
