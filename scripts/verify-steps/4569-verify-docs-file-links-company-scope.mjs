export default {
  name: "verify:docs-file-links-company-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-docs-file-links-company-scope.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-docs-file-links-company-scope.mjs"]);
  },
};
