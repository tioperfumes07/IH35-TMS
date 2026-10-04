export default {
  name: "verify:legal-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-legal-tenant-scope.mjs"]);
  },
};
