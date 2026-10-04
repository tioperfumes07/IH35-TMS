export default {
  name: "verify:driver-settlement-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-settlement-tenant-scope.mjs"]);
  },
};
