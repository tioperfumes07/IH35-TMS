export default {
  name: "verify:hos-clocks-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-hos-clocks-tenant-scope.mjs"]);
  },
};
