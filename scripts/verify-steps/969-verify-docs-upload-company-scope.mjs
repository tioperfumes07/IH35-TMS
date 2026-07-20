export default {
  name: "verify-docs-upload-company-scope",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-docs-upload-company-scope.mjs"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
