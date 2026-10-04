export default {
  name: "verify:qbo-push-rls-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-push-rls-tenant-scope.mjs"]);
  },
};
