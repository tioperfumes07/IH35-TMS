export default {
  name: "verify:docs-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-docs-tenant-scope.mjs"]);
  },
};
