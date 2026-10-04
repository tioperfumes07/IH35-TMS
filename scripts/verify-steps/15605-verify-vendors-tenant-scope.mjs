export default {
  name: "verify:vendors-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendors-tenant-scope.mjs"]);
  },
};
