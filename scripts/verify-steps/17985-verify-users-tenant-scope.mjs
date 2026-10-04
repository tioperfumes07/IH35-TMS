export default {
  name: "verify:users-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-users-tenant-scope.mjs"]);
  },
};
