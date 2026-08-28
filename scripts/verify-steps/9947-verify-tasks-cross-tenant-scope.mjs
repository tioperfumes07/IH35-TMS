export default {
  name: "verify:tasks-cross-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-tasks-cross-tenant-scope.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-tasks-cross-tenant-scope.mjs"]);
  },
};
