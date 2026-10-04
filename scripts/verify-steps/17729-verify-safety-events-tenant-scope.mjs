export default {
  name: "verify:safety-events-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-events-tenant-scope.mjs"]);
  },
};
