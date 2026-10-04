export default {
  name: "verify:escrow-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-escrow-tenant-scope.mjs"]);
  },
};
