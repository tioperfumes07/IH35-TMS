export default {
  name: "verify:home-attention-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-home-attention-tenant-scope.mjs"]);
  },
};
